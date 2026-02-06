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
    const crimeCount = crimeCountResult.recordset[0].count;

    if (crimeCount === 0) {
        console.log("Crimes table empty, syncing crimes from DC...");
        await updateCrimesFromDC();
    } else {
        console.log(`Crimes table already has ${crimeCount} records, skipping initial sync.`);
    }


}

export async function saveCrimeData(crime) {
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
    const { CCN, OFFENSE, REPORT_DAT, ADDRESS, LATITUDE, LONGITUDE, XBLOCK, YBLOCK } = crime;

    if (LATITUDE == null || LONGITUDE == null) return;
    const addr = ADDRESS || (XBLOCK && YBLOCK ? `Block X:${XBLOCK}, Y:${YBLOCK}` : "Address Data Unavailable");
    
    const request = pool.request();
    await request
    .input("id", sql.NVarChar, CCN)
        .input("type", sql.NVarChar, OFFENSE)
        .input("date", sql.DateTime, new Date(REPORT_DAT))
        .input("addr", sql.NVarChar, addr)
        .input("lat", sql.Decimal(10,7), LATITUDE)
        .input("lng", sql.Decimal(10,7), LONGITUDE)
        .input("raw", sql.NVarChar, JSON.stringify(crime))
    .query(`
        MERGE crimes WITH (HOLDLOCK) AS target
        USING (SELECT @id AS crime_id) AS source
        ON (target.crime_id = source.crime_id)
        WHEN MATCHED THEN
            UPDATE SET crime_type=@type, date_occurred=@date, address=@addr, latitude=@lat, longitude=@lng, raw_data=@raw
        WHEN NOT MATCHED THEN
            INSERT (crime_id, crime_type, date_occurred, address, latitude, longitude, raw_data)
            VALUES (@id, @type, @date, @addr, @lat, @lng, @raw);
    `);
}

export async function addCrimesToDB(year = crimeBaseYear) {
  
    console.log(`\nSyncing year ${year} (layer ${layerId})...`);

    let offset = countResult.recordset[0].currentCount; 
    console.log(`Resuming year ${year} from offset ${offset}`);
    let layerId = getLayerIdForYear(year)
    while (true) {
        const url = buildCrimeApiUrl(layerId, offset, reqLimit, crimeOutfields);
        const crimesBatch = await offloadReq(url);

        if (crimesBatch.length === 0) break;

        await Promise.all(crimesBatch.map(c => saveCrimeData(c.attributes)));

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
    console.log("Years in DB with record counts:", yearsCount);

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

    console.log(`\nSync complete. Total records added: ${totalInserted}`);
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



