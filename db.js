import sql from "mssql";
import { config } from "./config.js";

// Create a single global pool using config values
export const pool = new sql.ConnectionPool({
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  server: config.DB_SERVER,
  database: config.DB_NAME,
  port: parseInt(config.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: true },
});

// Initialize DB and create crimes table
export async function initDB() {
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
export async function saveCrimeData(crime) {
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



export async function addCrimes(baseUrl) {
  try {
    let total = 0;
    let offset = 0;
    const limit = 1000;

    while (true) {
      // Append paging parameters
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

      await new Promise((r) => setTimeout(r, 400));
    }

    console.log(`✔️ Sync Complete — ${total} total records.`);
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

      // small delay to avoid overwhelming DC API
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log(`Sync finished — ${total} total records processed.`);
  } catch (err) {
    console.error("Crime update failed:", err);
  }
}

// Get latest crime date in DB
export async function getLatestCrimeDate() {
  const result = await pool.request().query("SELECT MAX(date_occurred) AS lastDate FROM crimes");
  return result.recordset[0].lastDate; // null if empty
}


export async function checkSQLDB() {
  try {
    const result = await pool.request().query(`SELECT * FROM crimes 
WHERE date_occurred <= '2023-01-01' AND date_occurred >= '2022-01-01'
ORDER BY date_occurred DESC
OFFSET 0 ROWS
FETCH NEXT 50 ROWS ONLY;`
)
    console.log('Crimes found from 2022-24:', result);
  } catch (err){
    console.log('Error occured', err)
  }
}





