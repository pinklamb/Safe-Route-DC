import sql from "mssql";
import { config } from "./config.js";

const crimeBaseYear = 2025;
const crimeYearId = 7;
const reqLimit = 1000;



export const pool = new sql.ConnectionPool({
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    server: config.DB_SERVER,
    database: config.DB_NAME,
    port: parseInt(config.DB_PORT, 10),
    options: { encrypt: false, trustServerCertificate: true }
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
    await pool.connect();
    console.log("Successful Database Connection.");
    const crimeCountResult = await pool.request().query(`SELECT COUNT(*) AS count FROM crimes`);
   


}

async function saveCrimeData(crimesBatch) {
  const request = pool.request();

  // I switched to using a temp table, so I could load the crimes per batch instead of multiple req to sql server.
  await request.query(`
    CREATE TABLE #CrimesStage (
      crime_id NVARCHAR(50) PRIMARY KEY,
      crime_type NVARCHAR(255),
      date_occurred DATETIME,
      address NVARCHAR(255),
      latitude DECIMAL(10,7),
      longitude DECIMAL(10,7),
      raw_data NVARCHAR(MAX)
    );
  `);

  
  for (const crime of crimesBatch) {
    const { CCN, OFFENSE, REPORT_DAT, LATITUDE, LONGITUDE,} = crime.attributes;

 
    await request
      .input("id", sql.NVarChar, CCN)
      .input("type", sql.NVarChar, OFFENSE)
      .input("date", sql.DateTime, new Date(REPORT_DAT))
      .input("lat", sql.Decimal(10,7), LATITUDE)
      .input("lng", sql.Decimal(10,7), LONGITUDE)
      .query(`
        INSERT INTO #CrimesStage
          (crime_id, crime_type, date_occurred,  latitude, longitude)
        VALUES
          (@id, @type, @date, @lat, @lng);
      `);
    }

  // 
  await request.query(`
    MERGE crimes AS target
    USING #CrimesStage AS source
    ON target.crime_id = source.crime_id
    WHEN MATCHED THEN
      UPDATE SET
        crime_type = source.crime_type,
        date_occurred = source.date_occurred,
        latitude = source.latitude,
        longitude = source.longitude
    WHEN NOT MATCHED THEN
      INSERT (crime_id, crime_type, date_occurred, latitude, longitude)
      VALUES (
        source.crime_id,
        source.crime_type,
        source.date_occurred,
        source.latitude,
        source.longitude
      );
  `);
}


export async function addCrimesToDB(year = crimeBaseYear) {
    let layerId = getLayerIdForYear(year)

    console.log(`\nSyncing year ${year} (layer ${layerId})...`);
    const countResult = await pool.request().query(`SELECT COUNT(*) AS currentCount FROM crimes WHERE YEAR(date_occurred) = ${year}`);

    let offset = countResult.recordset[0].currentCount; 

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
    const request = pool.request();

    const result = await request.query(`
        SELECT YEAR(date_occurred) AS year, COUNT(*) AS count
        FROM crimes
        WHERE date_occurred IS NOT NULL
        GROUP BY YEAR(date_occurred)
    `);
    const counts = {};
    result.recordset.forEach(r => {
        counts[r.year] = r.count;
    });
    return counts;
}