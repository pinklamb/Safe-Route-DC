const config = require("../config")
const sql = require('mssql');

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

async function checkCrimes() {
  try {
    await pool.connect();

    const top10 = await pool.request().query("SELECT TOP 10 * FROM crimes");
    console.log("Top 10 crimes:", top10.recordset);

    const total = await pool.request().query("SELECT COUNT(*) AS total FROM crimes");
    console.log("Total crimes in DB:", total.recordset[0].total);

    const latest = await pool.request().query("SELECT MAX(date_occurred) AS lastDate FROM crimes");
    console.log("Last synced crime date:", latest.recordset[0].lastDate);

    const duplicates = await pool.request().query(`
      SELECT crime_id, COUNT(*) AS count
      FROM crimes
      GROUP BY crime_id
      HAVING COUNT(*) > 1
    `);
    console.log("Duplicate records:", duplicates.recordset.length);

    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

checkCrimes();
