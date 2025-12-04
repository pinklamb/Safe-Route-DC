import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import sql from "mssql";
import { pool } from "./db.js";




const app = express();
app.use(express.json());


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



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
    if (!route || route.length < 2) return res.status(400).json({ error: "No route provided" });


    let crimes = [];
    if (crimeData && Array.isArray(crimeData)) {
      crimes = crimeData.map(c => ({
        latitude: c.lat,
        longitude: c.lng,
        crime_type: c.crime_type,
        year: c.year || 2025
      }));
    } else {
      const lats = route.map(p => p.lat);
      const lngs = route.map(p => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLon = Math.min(...lngs), maxLon = Math.max(...lngs);

      const result = await pool.request()
        .input("minLat", sql.Decimal(10, 7), minLat)
        .input("maxLat", sql.Decimal(10, 7), maxLat)
        .input("minLon", sql.Decimal(10, 7), minLon)
        .input("maxLon", sql.Decimal(10, 7), maxLon)
        .query(`
          SELECT crime_type, latitude, longitude, date_occurred AS year
          FROM crimes
          WHERE latitude BETWEEN @minLat AND @maxLat
            AND longitude BETWEEN @minLon AND @maxLon
        `);

      crimes = result.recordset;
    }

    //Haversine distance
    const getDistanceKm = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const toRad = deg => (deg * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    const routeDistanceKm = route.reduce((acc, point, i) => {
      if (i === 0) return 0;
      const prev = route[i-1];
      return acc + getDistanceKm(prev.lat, prev.lng, point.lat, point.lng);
    }, 0);

    const safeRouteDistanceKm = Math.max(routeDistanceKm, 0.1); // minimum 100m

    const crimeTypeWeights = {
      "HOMICIDE": 5,
      "SEX ABUSE": 4,
      "ASSAULT WITH DANGEROUS WEAPON": 4,
      "ROBBERY": 3,
      "MOTOR VEHICLE THEFT": 2,
      "THEFT/AUTO": 1.5,
      "THEFT/OTHER": 1
    };

    const currentYear = 2025;
    const yearDecay = 0.3; 
    const thresholdKm = 0.1; // 100 meters

    let weightedCrimeCount = 0;
    const countedCrimes = new Set(); 

    for (const crime of crimes) {
      for (const point of route) {
        const dist = getDistanceKm(crime.latitude, crime.longitude, point.lat, point.lng);
        if (dist <= thresholdKm) {
          const crimeId = `${crime.latitude}-${crime.longitude}-${crime.crime_type}`;
          if (countedCrimes.has(crimeId)) break; 
          countedCrimes.add(crimeId);

          const typeWeight = crimeTypeWeights[crime.crime_type.toUpperCase()] || 1;
          const crimeYear = crime.year ? new Date(crime.year).getUTCFullYear() : currentYear;
          const yearWeight = Math.max(0.1, 1 - ((currentYear - crimeYear) * yearDecay));

          weightedCrimeCount += typeWeight * yearWeight;
          break;
        }
      }
    }

    //Time of day multiplier
    const hour = timeOfDay ?? start ?? new Date().getHours();
    let timeMultiplier = 1;
    if (hour >= 18 && hour < 22) timeMultiplier = 1.3;
    else if (hour >= 22 || hour < 4) timeMultiplier = 1.7;
    else if (hour >= 4 && hour < 6) timeMultiplier = 1.2;

    weightedCrimeCount *= timeMultiplier;

    const crimesPerKm = weightedCrimeCount / safeRouteDistanceKm;

    // Safety score normalization 
    const DECAY_FACTOR = 0.004;
    const normalized = Math.min(1 - Math.exp(-DECAY_FACTOR * Math.min(crimesPerKm, 50)), 1);
    const safetyScore = Math.max(0, Math.round(100 * (1 - normalized)));

    res.json({ safetyScore, crimesPerKm, routeDistanceKm });

  } catch (err) {
    console.error("Safety score error:", err);
    res.status(500).json({ error: "Failed to calculate safety score" });
  }
});



export default app;