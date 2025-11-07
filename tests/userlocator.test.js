import fetch from "node-fetch";
import app from "../app.js";
import sql from "mssql";  
import config from "../config.js";
import { initDB } from "../db.js";

let server;
// Haversine formula to calculate distance
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = (deg) => deg * (Math.PI / 180);

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}





export const pool = new sql.ConnectionPool({ 
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  server: config.DB_SERVER,
  database: config.DB_NAME,
  port: parseInt(config.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: true },
});





beforeAll(async() => {
  await initDB()
  server = app.listen(process.env.PORT || 4000);

});

afterAll(() => {
  server.close();
});

describe("User location API", () => {
  const userLat = 38.8977;   // White House
  const userLon = -77.0365;

  test("should return crimes near the user", async () => {
    const url = `http://localhost:${process.env.PORT || 4000}/api/crimes?minLat=${userLat - 0.01}&maxLat=${userLat + 0.01}&minLon=${userLon - 0.01}&maxLon=${userLon + 0.01}`;

    const res = await fetch(url);
    expect(res.ok).toBe(true);

    const crimes = await res.json();

    // Assert we get at least one crime
    expect(crimes.length).toBeGreaterThan(0);

    // Optional: check that closest crime distance is reasonable
    let closest = crimes[0];
    let minDist = getDistance(userLat, userLon, closest.latitude, closest.longitude);

    for (const crime of crimes) {
      const dist = getDistance(userLat, userLon, crime.latitude, crime.longitude);
      if (dist < minDist) {
        minDist = dist;
        closest = crime;
      }
    }

    expect(minDist).toBeGreaterThanOrEqual(0);
    expect(closest).toHaveProperty("crime_type");
    expect(closest).toHaveProperty("address");
    expect(closest).toHaveProperty("date_occurred");
  });
});

