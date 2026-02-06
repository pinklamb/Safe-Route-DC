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




<<<<<<< HEAD
=======


>>>>>>> 93188010d429c73ccc5ddb02ba4d9f77b15b1b44

app.post("/api/safetyScore", async (req, res) => {
  try {
    const { route, start, timeOfDay, crimeData } = req.body;

    if (!route || route.length < 2) {
      return res.status(400).json({ error: "No route provided" });
    }

    let crimes = [];

    // Use injected crime data (for tests)
    if (Array.isArray(crimeData)) {
      crimes = crimeData.map(crime => ({
        latitude: crime.lat,
        longitude: crime.lng,
        crime_type: crime.crime_type,
        year: crime.year || 2025,
      }));
    } else {
      if (!pool?.connected) {
        return res.status(500).json({ error: "Database connection not ready" });
      }

      // Build bounding box
      const lats = route.map(point => point.lat);
      const lngs = route.map(point => point.lng);

      const buffer = 0.002; 
      const minLat = Math.min(...lats) - buffer;
      const maxLat = Math.max(...lats) + buffer;
      const minLon = Math.min(...lngs) - buffer;
      const maxLon = Math.max(...lngs) + buffer;

    
      const result = await pool.request()
        .input("minLat", sql.Decimal(10, 7), minLat)
        .input("maxLat", sql.Decimal(10, 7), maxLat)
        .input("minLon", sql.Decimal(10, 7), minLon)
        .input("maxLon", sql.Decimal(10, 7), maxLon)
        .query(`
          SELECT crime_type, latitude, longitude, YEAR(date_occurred) AS year
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
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const routeDistanceKm = route.reduce((acc, point, i) => {
      if (i === 0) return 0;
      const prev = route[i - 1];
      return acc + getDistanceKm(prev.lat, prev.lng, point.lat, point.lng);
    }, 0);

    const safeRouteDistanceKm = Math.max(routeDistanceKm,1.0); 

    const crimeTypeWeights = {
      "HOMICIDE": 5,
      "SEX ABUSE": 4,
      "ASSAULT WITH DANGEROUS WEAPON": 4,
      "ROBBERY": 3,
      "MOTOR VEHICLE THEFT": 3,
      "THEFT/AUTO": 2,
      "THEFT/OTHER": 2,
    };
    let explanations = [];
    const currentYear = 2025;
    const thresholdKm = 0.18;
    let weightedCrimeCount = 0;
    const countedCrimes = new Set();
    for (const crime of crimes) {
      for (const point of route) {
        const dist = getDistanceKm(crime.latitude, crime.longitude, point.lat, point.lng);
        if (dist <= thresholdKm) {
          const crimeId = `${crime.latitude}-${crime.longitude}-${crime.crime_type}-${crime.year}`;
          if (countedCrimes.has(crimeId)) break;
          countedCrimes.add(crimeId);

          const typeWeight = crimeTypeWeights[crime.crime_type.toUpperCase()] || 1;
          const crimeYear = crime.year || currentYear;
          const age = Math.max(0, currentYear - crimeYear);
          const yearWeight = Math.pow(0.8, age);

          weightedCrimeCount += typeWeight * yearWeight;
          break;
        }
      }
    }
    const hour = timeOfDay ?? start ?? new Date().getHours();
    let timeMultiplier = 1.0;
    if (hour >= 6 && hour < 18) timeMultiplier = 1.0;
    else if (hour >= 18 && hour < 22) timeMultiplier = 1.3;
    else timeMultiplier = 1.6;

   


    
    const crimesPerKm = weightedCrimeCount / safeRouteDistanceKm;
    const adjustedCrimeCount = crimesPerKm * timeMultiplier;

    

    const decayFactor = 0.0004;
    const safetyScore = Math.max(0, Math.round(100 * Math.exp(-decayFactor * adjustedCrimeCount)));
    console.log("weightedCrimeCount:"+ weightedCrimeCount, "countedCrimes:"+ countedCrimes.size,
safetyScore)
    res.json({
    safetyScore,
    weightedCrimeCount,
    crimesPerKm,
      routeDistanceKm,
      timeOfDay: timeOfDay ?? start ?? new Date().getHours(),

    })



  } catch (err) {
    console.error("Safety score error:", err);
    res.status(500).json({ error: "Failed to calculate safety score" });
  }
});






export default app;
