import request from "supertest";
import app, { setDbPool } from "../app.js";
import sql from "mssql";
import { testPool as pool } from "./testdb.js";

const testRoutes = {
  unsafe: [
    { lat: 38.9230, lng: -77.0180 },
    { lat: 38.9235, lng: -77.0175 },
  ],
  moderate: [
    { lat: 38.9250, lng: -77.0165 },
    { lat: 38.9255, lng: -77.0160 },
  ],
  safe: [
    { lat: 38.9270, lng: -77.0145 },
    { lat: 38.9275, lng: -77.0140 },
  ],
};

// Generates dummy crimes along a route
function generateCrimes(route, count, type = "THEFT/OTHER", year = 2025) {
  return Array(count)
    .fill(0)
    .map((_, i) => ({
      lat: route[0].lat + i * 0.0001,
      lng: route[0].lng + i * 0.0001,
      crime_type: type,
      year,
    }));
}


async function insertCrime(crime) {
  await pool
    .request()
    .input("lat", sql.Float, crime.lat)
    .input("lng", sql.Float, crime.lng)
    .input("crime_type", sql.NVarChar, crime.crime_type)
    .input("year", sql.Int, crime.year)
    .query(`
      INSERT INTO dbo.crimes (lat, lng, crime_type, date_occurred)
      VALUES (@lat, @lng, @crime_type, DATEFROMPARTS(@year, 1, 1))
    `);
}

beforeAll(async () => {

  if (!pool.connected) await pool.connect();
  setDbPool(pool);

  await pool.request().query(`
    IF OBJECT_ID('dbo.crimes', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.crimes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        lat FLOAT NOT NULL,
        lng FLOAT NOT NULL,
        crime_type NVARCHAR(50) NOT NULL,
        date_occurred DATE NOT NULL
      );
    END
  `);


  await pool.request().query(`DELETE FROM dbo.crimes`);
  // Insert dummy crimes
  const unsafeCrimes = generateCrimes([{ lat: 38.9230, lng: -77.0180 }], 10, "HOMICIDE");
  const moderateCrimes = generateCrimes([{ lat: 38.9250, lng: -77.0165 }], 5, "ROBBERY");
  const safeCrimes = generateCrimes([{ lat: 38.9270, lng: -77.0145 }], 1, "THEFT/OTHER");

  for (const crime of [...unsafeCrimes, ...moderateCrimes, ...safeCrimes]) {
    await insertCrime(crime);
  }


  const recentYears = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  for (const year of recentYears) {
    await insertCrime({ lat: 38.9300, lng: -77.0100, crime_type: "THEFT/OTHER", year });
  }
});

afterAll(async () => {
  await pool.request().query(`DELETE FROM dbo.crimes`);
  await pool.close();
});

describe("POST /api/safetyScore", () => {
  test("Scores rank Unsafe < Moderate < Safe", async () => {
    const unsafeRes = await request(app).post("/api/safetyScore").send({ route: testRoutes.unsafe, timeOfDay: 14 });
    const moderateRes = await request(app).post("/api/safetyScore").send({ route: testRoutes.moderate, timeOfDay: 14 });
    const safeRes = await request(app).post("/api/safetyScore").send({ route: testRoutes.safe, timeOfDay: 14 });

    expect(unsafeRes.body.safetyScore).toBeLessThan(moderateRes.body.safetyScore);
    expect(moderateRes.body.safetyScore).toBeLessThan(safeRes.body.safetyScore);
    expect(unsafeRes.body.safetyScore).toBeLessThan(100);
    expect(safeRes.body.safetyScore).toBeGreaterThanOrEqual(90);
  });

  test("Scores decrease during higher risk hours", async () => {
    const morningRes = await request(app).post("/api/safetyScore").send({ route: testRoutes.safe, timeOfDay: 8 });
    const eveningRes = await request(app).post("/api/safetyScore").send({ route: testRoutes.safe, timeOfDay: 18 });
    const nightRes = await request(app).post("/api/safetyScore").send({ route: testRoutes.safe, timeOfDay: 23 });

    expect(eveningRes.body.safetyScore).toBeLessThan(morningRes.body.safetyScore);
    expect(nightRes.body.safetyScore).toBeLessThan(morningRes.body.safetyScore);
    expect(nightRes.body.safetyScore).toBeLessThanOrEqual(eveningRes.body.safetyScore);
  });

  test("Handles edge case: empty route", async () => {
    const res = await request(app).post("/api/safetyScore").send({ route: [], timeOfDay: 14 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No route provided");
  });

  test("Handles edge case: no crimes nearby", async () => {
    const res = await request(app).post("/api/safetyScore").send({ route: [{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0.001 }], timeOfDay: 14 });
    expect(res.body.safetyScore).toBeGreaterThanOrEqual(90);
    expect(res.body.crimesPerKm).toBeCloseTo(0, 0);
  });
});

describe("Crime data integrity", () => {
  const recentYears = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

  it("should have at least one crime for each year in the recent range", async () => {
    const result = await pool.request()
      .query(`SELECT DISTINCT YEAR(date_occurred) AS year FROM dbo.crimes WHERE YEAR(date_occurred) BETWEEN 2018 AND 2025`);

    const yearsInDb = result.recordset.map(record => parseInt(record.year));
    for (const year of recentYears) {
      expect(yearsInDb).toContain(year);
    }
  });

  it("should have at least one crime in the most recent year", async () => {
    const mostRecentYear = Math.max(...recentYears);
    const result = await pool.request()
      .input("year", sql.Int, mostRecentYear)
      .query(`SELECT COUNT(*) AS count FROM dbo.crimes WHERE YEAR(date_occurred) = @year`);

    expect(result.recordset[0].count).toBeGreaterThan(0);
  });
});
