import mysql from "mysql2/promise";
import { config } from "./config.js";

export const pool = mysql.createPool({
  uri: config.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function initDB() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS crimes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crime_id VARCHAR(50) UNIQUE,
      crime_type VARCHAR(255),
      date_occurred DATETIME,
      address VARCHAR(255),
      latitude DECIMAL(10,7),
      longitude DECIMAL(10,7),
      raw_data JSON
    )
  `;
  await pool.query(createTableSQL);
  console.log("Crimes table ready!");
}

export async function saveCrimeData(crime) {
  const { CCN, OFFENSE, REPORT_DAT, ADDRESS, LATITUDE, LONGITUDE } = crime;

  const query = `
    INSERT INTO crimes (crime_id, crime_type, date_occurred, address, latitude, longitude, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      crime_type = VALUES(crime_type),
      date_occurred = VALUES(date_occurred),
      address = VALUES(address),
      latitude = VALUES(latitude),
      longitude = VALUES(longitude),
      raw_data = VALUES(raw_data)
  `;

  await pool.query(query, [
    CCN,
    OFFENSE,
    new Date(REPORT_DAT),
    ADDRESS,
    LATITUDE,
    LONGITUDE,
    JSON.stringify(crime),
  ]);
}


export async function addCrimes(baseUrl) {
  try {
    let total = 0;
    let offset = 0;
    const limit = 1000;

    while (true) {
      const url = `${baseUrl}&resultOffset=${offset}&resultRecordCount=${limit}`;
      const response = await fetch(url);
      const data = await response.json();
      const features = data.features || [];

      if (features.length === 0) break;

      for (const f of features) {
        await saveCrimeData(f.attributes);
      }

      total += features.length;
      offset += limit;
      console.log(`Synced ${total} records...`);

      await new Promise(r => setTimeout(r, 400));
    }

    console.log(`Sync Complete — ${total} total records.`);
  } catch (err) {
    console.error("❌ Crime update failed:", err);
  }
}

export async function updateCrimesFromDC(sinceDate = null) {
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

      await new Promise(r => setTimeout(r, 400));
    }

    console.log(` Sync finished — ${total} total records processed.`);
  } catch (err) {
    console.error("Crime update failed:", err);
  }
}

export async function getLatestCrimeDate() {
  const [rows] = await pool.query("SELECT MAX(date_occurred) AS lastDate FROM crimes");
  return rows[0].lastDate;
}

export async function checkDB() {
  const [rows] = await pool.query(`
    SELECT * FROM crimes
    WHERE date_occurred BETWEEN '2022-01-01' AND '2023-01-01'
    ORDER BY date_occurred DESC
    LIMIT 50
  `);
  console.log("Crimes found from 2022-2023:", rows);
}





