import sql from "mssql";
import { config } from "./config.js";

const baseYear = 2025;
const baseLayerId = 7;
const reqLimit = 1000;
const apiDelayMs = 300;
const outFields = "CCN,REPORT_DAT,OFFENSE,LATITUDE,LONGITUDE,XBLOCK,YBLOCK";

export const pool = new sql.ConnectionPool({
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    server: config.DB_SERVER,
    database: config.DB_NAME,
    port: parseInt(config.DB_PORT, 10),
    options: { encrypt: false, trustServerCertificate: true }
});

function getLayerIdForYear(year = baseYear) {
    return baseLayerId + (year - baseYear);
}

function buildCrimeApiUrl(layerId, offset, limit, outFields) {
    return `https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/FeatureServer/${layerId}/query?where=1%3D1&outFields=${outFields}&outSR=4326&returnGeometry=false&resultOffset=${offset}&resultRecordCount=${limit}&f=json`;
}

async function offloadReq(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.features) return [];
    return data.features;
}

async function checkLayerExistence(year) {
    const layerId = getLayerIdForYear(year);
    const url = buildCrimeApiUrl(layerId, 0, 1, "CCN");
    const features = await offloadReq(url);
    return features.length > 0;
}

export async function startDB() {
    await pool.connect();
    console.log("Connected to DB");

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

    console.log("DB setup complete");
}

export async function saveCrimeData(crime) {
    const { CCN, OFFENSE, REPORT_DAT, ADDRESS, LATITUDE, LONGITUDE, XBLOCK, YBLOCK } = crime;
    const request = pool.request();
    const addr = ADDRESS || (XBLOCK && YBLOCK ? `Block X:${XBLOCK}, Y:${YBLOCK}` : "Address Data Unavailable");

    const q = `
      MERGE crimes AS t
      USING (SELECT @id AS crime_id) AS s
      ON t.crime_id = s.crime_id
      WHEN MATCHED THEN
        UPDATE SET
          crime_type=@type,
          date_occurred=@date,
          address=@addr,
          latitude=@lat,
          longitude=@lng,
          raw_data=@raw
      WHEN NOT MATCHED THEN
        INSERT (crime_id, crime_type, date_occurred, address, latitude, longitude, raw_data)
        VALUES (@id, @type, @date, @addr, @lat, @lng, @raw);
    `;

    await request
        .input("id", sql.NVarChar, CCN)
        .input("type", sql.NVarChar, OFFENSE)
        .input("date", sql.DateTime, new Date(REPORT_DAT))
        .input("addr", sql.NVarChar, addr)
        .input("lat", sql.Decimal(10,7), LATITUDE)
        .input("lng", sql.Decimal(10,7), LONGITUDE)
        .input("raw", sql.NVarChar, JSON.stringify(crime))
        .query(q);
}

export async function addCrimesToDB(year = baseYear) {
    let total = 0;
    let offset = 0;
    const layerId = getLayerIdForYear(year);

    console.log(`\nSyncing year ${year} (layer ${layerId})...`);

    while (true) {
        const url = buildCrimeApiUrl(layerId, offset, reqLimit, outFields);
        const crimesBatch = await offloadReq(url);

        if (crimesBatch.length === 0) break;

        for (const crime of crimesBatch) {
            await saveCrimeData(crime.attributes);
        }

        total += crimesBatch.length;
        offset += crimesBatch.length;
        await new Promise(resolve => setTimeout(resolve, apiDelayMs));
        console.log(`Added ${total} records so far for year ${year}...`);
    }

    console.log(`Finished year ${year}, total records added: ${total}`);
    return total;
}

export async function updateCrimesFromDC() {
    let total = 0;
    const years = [];
    let currentYear = baseYear;
    const latestDate = await getLatestCrimeDate();
    const latestYearInDB = latestDate ? new Date(latestDate).getFullYear() : null;
    console.log(`Latest year in DB: ${latestYearInDB ?? "none"}`);
    while (await checkLayerExistence(currentYear) && (latestYearInDB === null || currentYear > latestYearInDB)) {
        years.push(currentYear);
        currentYear--;
        await new Promise(resolve => setTimeout(resolve, apiDelayMs));
    }
    for (const year of years) {
        total += await addCrimesToDB(year);
    }

    console.log(`\nSync complete. Total records added: ${total}`);
    return total;
}
export async function getLatestCrimeDate() {
    const request = pool.request();

    const result = await request.query(`
        SELECT TOP 1 date_occurred
        FROM crimes
        WHERE date_occurred IS NOT NULL
        ORDER BY date_occurred DESC
    `);

    if (result.recordset.length > 0) {
        return result.recordset[0].date_occurred;
    } else {
        return null;
    }
}

