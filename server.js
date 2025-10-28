import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import sql from "mssql";
import Openrouteservice from './openrouteservice-js/dist/ors-js-client.umd.cjs'

let orsDirections = new Openrouteservice.Directions({ api_key:config.api_key });


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.PORT || 4000;
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});



// calculate distance 
app.post("/api/distance", (req, res) => {
  const { userLocation, destination } = req.body;

  if (!userLocation || !destination) {
    return res.status(400).json({ error: "Missing user location or destination" });
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth's radius in km

  const dLat = toRad(destination.lat - userLocation.lat);
  const dLon = toRad(destination.lon - userLocation.lon);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(userLocation.lat)) *
    Math.cos(toRad(destination.lat)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  res.json({ distance });
});



// Single global pool using config values
const pool = new sql.ConnectionPool({
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  server: config.DB_SERVER,
  database: config.DB_NAME,
  port: parseInt(config.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: true },
});


// Initialize DB and create crimes table
async function initDB() {
  await pool.connect();
  console.log("Connected to SQL Server");

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'crimes')
    BEGIN
      CREATE TABLE crimes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        crime_id NVARCHAR(50) UNIQUE,
        crime_type NVARCHAR(255),
        date_occurred DATETIME,
        address NVARCHAR(255),
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        raw_data NVARCHAR(MAX)
      );
    END
  `);

  console.log("Crimes table ready!");
}

// Save or update a single crime
async function saveCrimeData(crime) {
  const { CCN, OFFENSE, REPORT_DAT, ADDRESS, LATITUDE, LONGITUDE } = crime;
  const request = pool.request();

  const query = `
    MERGE crimes AS target
    USING (SELECT @crime_id AS crime_id) AS source
    ON target.crime_id = source.crime_id
    WHEN MATCHED THEN 
      UPDATE SET 
        crime_type = @crime_type,
        date_occurred = @date_occurred,
        address = @address,
        latitude = @latitude,
        longitude = @longitude,
        raw_data = @raw_data
    WHEN NOT MATCHED THEN
      INSERT (crime_id, crime_type, date_occurred, address, latitude, longitude, raw_data)
      VALUES (@crime_id, @crime_type, @date_occurred, @address, @latitude, @longitude, @raw_data);
  `;

  await request
    .input("crime_id", sql.NVarChar, CCN)
    .input("crime_type", sql.NVarChar, OFFENSE)
    .input("date_occurred", sql.DateTime, new Date(REPORT_DAT))
    .input("address", sql.NVarChar, ADDRESS)
    .input("latitude", sql.Decimal(10, 7), LATITUDE)
    .input("longitude", sql.Decimal(10, 7), LONGITUDE)
    .input("raw_data", sql.NVarChar, JSON.stringify(crime))
    .query(query);
}

// Get latest crime date in DB
async function getLatestCrimeDate() {
  const result = await pool.request().query("SELECT MAX(date_occurred) AS lastDate FROM crimes");
  return result.recordset[0].lastDate; // null if empty
}

// Fetch crimes from DC
async function updateCrimesFromDC(sinceDate = null) {
  try {
    console.log(sinceDate ? `Syncing new crimes since ${sinceDate}...` : "Syncing all DC crimes...");
    let total = 0;
    let offset = 0;
    const limit = 1000;
    const dateFilter = sinceDate ? `AND REPORT_DAT > '${sinceDate.toISOString()}'` : "";

    while (true) {
      const url = `https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/FeatureServer/7/query?where=1%3D1${dateFilter}&outFields=*&outSR=4326&f=json&resultOffset=${offset}&resultRecordCount=${limit}`;
      const response = await fetch(url);
      const data = await response.json();
      const features = data.features || [];
      if (features.length === 0) break;

      for (const f of features) await saveCrimeData(f.attributes);

      total += features.length;
      offset += limit;
      console.log(`Synced ${total} records so far...`);

      // small delay to avoid overwhelming DC API
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log(`Sync finished — ${total} total records processed.`);
  } catch (err) {
    console.error("Crime update failed:", err);
  }
}

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

// Start DB, server, initial sync, and periodic updates
initDB()
  .then(async () => {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}/`));

    // Get the newest crime in DB
    const lastDate = await getLatestCrimeDate();

    // Only fetch crimes after the latest one
    await updateCrimesFromDC(lastDate);

    // Hourly incremental updates
    setInterval(async () => {
      const lastDate = await getLatestCrimeDate();
      await updateCrimesFromDC(lastDate);
    }, 3600000);
  })
  .catch((err) => console.error("DB init failed:", err));


// ORS autocomplete user input 
app.post("/api/autocomplete", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const geoRes = await fetch(
      `https://api.openrouteservice.org/geocode/autocomplete?api_key=${config.api_key}&text=${encodeURIComponent(query)}`
    );
    const geoData = await geoRes.json();
    res.json(geoData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch autocomplete" });
  }
});


// backend endpoint for ORS routing
app.post("/api/route", async (req, res) => {
  const { start, end } = req.body;

  if (!start || !end) {
    return res.status(400).json({ error: "Missing start or end coordinates" });
  }

  try {
    // ORS expects [lon, lat] 
    const response = await orsDirections.calculate({
      "coordinates": [
        [start.lon, start.lat],
        [end.lon, end.lat]
      ],
      "profile": "foot-walking",
      "format": "geojson"         
    });

    res.json(response);
  } catch (err) {
    console.error("ORS error:", err);
    res.status(500).json({ error: "Failed to fetch route from ORS", details: err.message });
  }
});



























