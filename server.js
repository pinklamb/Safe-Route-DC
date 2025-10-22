require('dotenv').config();

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const mysql = require("mssql");
const app = express();
const PORT = process.env.PORT || 4000;
const sql = require('mssql');


// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});





const pool = new sql.ConnectionPool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
});


async function createCrimeDB() {
  await pool.connect();

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'CrimeDB')
    BEGIN
      CREATE DATABASE CrimeDB;
    END
  `);

  console.log("CrimeDB is ready!");
  pool.close();
}

createCrimeDB();


async function saveCrimeData(crime) {
  const { CCN, OFFENSE, REPORT_DAT, ADDRESS, LATITUDE, LONGITUDE } = crime;

  await pool.connect();
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

  await pool.request()
    .input("crime_id", sql.NVarChar, CCN)
    .input("crime_type", sql.NVarChar, OFFENSE)
    .input("date_occurred", sql.DateTime, new Date(REPORT_DAT))
    .input("address", sql.NVarChar, ADDRESS)
    .input("latitude", sql.Decimal(10, 7), LATITUDE)
    .input("longitude", sql.Decimal(10, 7), LONGITUDE)
    .input("raw_data", sql.NVarChar, JSON.stringify(crime))
    .query(query);

  pool.close();
}




// API route to fetch crimes from DC gets 2025 incidents 
app.get("/api/crimes", async (req, res) => {
  try {
    const { minLon, minLat, maxLon, maxLat } = req.query;

    let url =
      "https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/FeatureServer/7/query?where=1%3D1&outFields=*&outSR=4326&f=json";

    if (minLon && minLat && maxLon && maxLat) {
      const geometry = encodeURIComponent(
        JSON.stringify({
          xmin: parseFloat(minLon),
          ymin: parseFloat(minLat),
          xmax: parseFloat(maxLon),
          ymax: parseFloat(maxLat),
          spatialReference: { wkid: 4326 }
        })
      );

      url = `https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/FeatureServer/7/query?geometry=${geometry}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=json`;
    }

    const response = await fetch(url);
    const data = await response.json();
    const features = data.features || [];

    // Save all crimes to SQL Server
    for (const feature of features) {
      await saveCrime(feature.attributes);
    }

    res.json(features);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch and save crime data" });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});



















