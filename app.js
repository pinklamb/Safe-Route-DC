import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import sql from "mssql";
import { pool } from "./db.js";





const app = express();
app.use(express.json());


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// Query crimes locally by bounding box
app.get("/api/crimes", async (req, res) => {
  try {
    const { minLon, minLat, maxLon, maxLat } = req.query;
    let query = "SELECT * FROM crimes";
    const inputs = [];

    if (minLon && minLat && maxLon && maxLat) {
      query += " WHERE latitude BETWEEN @minLat AND @maxLat AND longitude BETWEEN @minLon AND @maxLon";
      inputs.push(
        { name: "minLat", type: sql.Decimal(10, 7), value: parseFloat(minLat) },
        { name: "maxLat", type: sql.Decimal(10, 7), value: parseFloat(maxLat) },
        { name: "minLon", type: sql.Decimal(10, 7), value: parseFloat(minLon) },
        { name: "maxLon", type: sql.Decimal(10, 7), value: parseFloat(maxLon) }
      );
    }

    const request = pool.request();
    inputs.forEach((i) => request.input(i.name, i.type, i.value));
    const result = await request.query(query);

    res.json(result.recordset);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch crimes" });
  }
});

function getDistForScore(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}




app.post("/api/safetyScore", async (req, res) => {
  try {
    const { route, start, timeOfDay, crimeData } = req.body;

    if (!route || !route.length) {
      return res.status(400).json({ error: "No route provided" });
    }

    // Use crimeData from request for testing, otherwise query DB
    let crimes = [];
    if (crimeData && Array.isArray(crimeData) && crimeData.length) {
      crimes = crimeData.map(c => ({
        latitude: c.lat,
        longitude: c.lng,
        crime_type: c.crime_type
      }));
    } else {
      const lats = route.map(p => p.lat);
      const lngs = route.map(p => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLon = Math.min(...lngs);
      const maxLon = Math.max(...lngs);

      const result = await pool.request()
        .input("minLat", sql.Decimal(10, 7), minLat)
        .input("maxLat", sql.Decimal(10, 7), maxLat)
        .input("minLon", sql.Decimal(10, 7), minLon)
        .input("maxLon", sql.Decimal(10, 7), maxLon)
        .query(`
          SELECT crime_type, latitude, longitude
          FROM crimes
          WHERE latitude BETWEEN @minLat AND @maxLat
            AND longitude BETWEEN @minLon AND @maxLon
        `);

      crimes = result.recordset;
    }

    const getDistanceKm = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const toRad = deg => (deg * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const routeDistanceKm = route.reduce((acc, point, i) => {
      if (i === 0) return 0;
      const prev = route[i - 1];
      return acc + getDistanceKm(prev.lat, prev.lng, point.lat, point.lng);
    }, 0);

    const safeRouteDistanceKm = routeDistanceKm > 0 ? routeDistanceKm : 0.001;

    const thresholdKm = 0.05;
    const violentCrimes = ["ASSAULT", "ROBBERY", "HOMICIDE", "SEX ABUSE"];
    let weightedCrimeCount = 0;

    for (const crime of crimes) {
      for (const point of route) {
        const dist = getDistanceKm(crime.latitude, crime.longitude, point.lat, point.lng);
        if (dist <= thresholdKm) {
          weightedCrimeCount += violentCrimes.includes(crime.crime_type.toUpperCase()) ? 2 : 1;
          break;
        }
      }
    }

    // Use timeOfDay from test, otherwise use start, otherwise current hour
    const hour = timeOfDay ?? start ?? new Date().getHours();
    let timeMultiplier = 1;
    if (hour >= 18 && hour < 22) timeMultiplier = 1.3;
    else if (hour >= 22 || hour < 4) timeMultiplier = 1.7;
    else if (hour >= 4 && hour < 6) timeMultiplier = 1.2;

    weightedCrimeCount *= timeMultiplier;

    const crimesPerKm = weightedCrimeCount / safeRouteDistanceKm;
    const DECAY_FACTOR = 0.015;
    const normalized = 1 - Math.exp(-DECAY_FACTOR * crimesPerKm);
    const safetyScore = Math.min(Math.round(100 * (1 - normalized)));


    console.log(
      "Distance (km):", routeDistanceKm.toFixed(2),
      "| Crimes/km:", crimesPerKm.toFixed(2),
      "| Score:", safetyScore
    );

    res.json({ safetyScore, crimesPerKm });

  } catch (err) {
    console.error("Safety score error:", err);
    res.status(500).json({ error: "Failed to calculate safety score" });
  }
});




export default app;