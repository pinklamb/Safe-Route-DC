import mysql from "mysql2/promise";
import { config } from "./config.js";

const crimeBaseYear = 2025;
const crimeYearId = 7;
const reqLimit = 1000;



export const pool = mysql.createPool({
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    host: config.DB_SERVER,
    database: config.DB_NAME,
    port: parseInt(config.DB_PORT, 10),
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true
});



function getLayerIdForYear(year = crimeBaseYear) {
    return crimeYearId + (year - crimeBaseYear);
}

function buildCrimeApiUrl(layerId, offset, limit) {
    return `https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/FeatureServer/${layerId}/query?where=1%3D1&outFields=CCN,REPORT_DAT,OFFENSE,LATITUDE,LONGITUDE,XBLOCK,YBLOCK&outSR=4326&returnGeometry=false&resultOffset=${offset}&resultRecordCount=${limit}&f=json`;
}




async function offloadReq(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.features) return [];
    return data.features;
}

async function checkLayerExistence(year) {
    const layerId = getLayerIdForYear(year);
    const url = buildCrimeApiUrl(layerId, 0, 1);
    const features = await offloadReq(url);
    return features.length > 0;
}

export async function startDB() {
    const conn = await pool.getConnection();
    console.log("Successful Database Connection.");
    conn.release();
   


}

async function saveCrimeData(crimesBatch) {
  const conn = await pool.getConnection();

  try {
    // I switched to using a temp table, so I could load the crimes per batch instead of multiple req to sql server.
    await conn.query(`
      CREATE TEMPORARY TABLE IF NOT EXISTS CrimesStage (
        crime_id VARCHAR(50) PRIMARY KEY,
        crime_type VARCHAR(255),
        date_occurred DATETIME,
        address VARCHAR(255),
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
      );
    `);

    await conn.query(`TRUNCATE TABLE CrimesStage;`);


    for (const crime of crimesBatch) {
      const { CCN, OFFENSE, REPORT_DAT, LATITUDE, LONGITUDE,} = crime.attributes;


      await conn.query(
        `INSERT INTO CrimesStage
          (crime_id, crime_type, date_occurred, latitude, longitude)
        VALUES
          (?, ?, ?, ?, ?);`,
        [CCN, OFFENSE, new Date(REPORT_DAT), LATITUDE, LONGITUDE]
      );
      }

    //
    await conn.query(`
      INSERT INTO crimes (crime_id, crime_type, date_occurred, latitude, longitude)
      SELECT crime_id, crime_type, date_occurred, latitude, longitude FROM CrimesStage
      ON DUPLICATE KEY UPDATE
        crime_type = VALUES(crime_type),
        date_occurred = VALUES(date_occurred),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude);
    `);
  } finally {
    conn.release();
  }
}


export async function addCrimesToDB(year = crimeBaseYear) {
    let layerId = getLayerIdForYear(year)
    let totalInserted = 0;

    console.log(`\nSyncing year ${year} (layer ${layerId})...`);
    const [countRows] = await pool.query(`SELECT COUNT(*) AS currentCount FROM crimes WHERE YEAR(date_occurred) = ?`, [year]);

    let offset = countRows[0].currentCount;

    console.log(`Resuming year ${year} from offset ${offset}`);
    while (true) {
        const url = buildCrimeApiUrl(layerId, offset, reqLimit);
        const crimesBatch = await offloadReq(url);

        if (crimesBatch.length === 0) break;

        await saveCrimeData(crimesBatch);


        totalInserted += crimesBatch.length;
        offset += crimesBatch.length;

      
        console.log(`Processed batch of ${crimesBatch.length} records. Total so far for ${year}: ${totalInserted}`);
        await new Promise(r => setTimeout(r, 3000)); // Open Data DC recommends a 3 second delay in between api calls.
    }

    console.log(`Finished year ${year}. Total inserted: ${totalInserted}`);
    return totalInserted;
}


export async function updateCrimesFromDC() {
    let totalInserted = 0;

    const yearsCount = await getLatestCrimeDate();

    const startYear = 2018;
    const endYear = 2025;

    
    for (let year = startYear; year <= endYear; year++) {
        if (yearsCount[year] && yearsCount[year] >= 20000) {
            console.log(`Skipping year ${year}: already has ${yearsCount[year]} records`);
            continue;
        }

        const exists = await checkLayerExistence(year);
        if (!exists) {
            console.log(`Skipping year ${year}: No layer returned from API.`);
            continue;
        }

        console.log(`Processing year ${year}...`);
        const inserted = await addCrimesToDB(year); 
        totalInserted += inserted;
    }

    console.log('Sync complete.');
}


export async function getLatestCrimeDate() {
    const [rows] = await pool.query(`
        SELECT YEAR(date_occurred) AS year, COUNT(*) AS count
        FROM crimes
        WHERE date_occurred IS NOT NULL
        GROUP BY YEAR(date_occurred)
    `);
    const counts = {};
    rows.forEach(r => {
        counts[r.year] = r.count;
    });
    return counts;
}
