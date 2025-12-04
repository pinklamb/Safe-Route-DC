import request from "supertest";
import app from "../app.js";

let server;

const testRoutes = {
  unsafe: [
    { lat: 38.9230, lng: -77.0180 }, // violent crimes
    { lat: 38.9235, lng: -77.0175 },
  ],
  moderate: [
    { lat: 38.9250, lng: -77.0165 },
    { lat: 38.9255, lng: -77.0160 }, // theft crimes
  ],
  safe: [
    { lat: 38.9270, lng: -77.0145 },
    { lat: 38.9275, lng: -77.0140 }, // no crimes
  ],
};

// dummyCrimes aligned to make Unsafe > Moderate > Safe
const dummyCrimes = [
  // Unsafe route
  { lat: 38.9230, lng: -77.0180, crime_type: "HOMICIDE", year: 2025 },
  { lat: 38.9235, lng: -77.0175, crime_type: "SEX ABUSE", year: 2025 },
  { lat: 38.9232, lng: -77.0178, crime_type: "ROBBERY", year: 2024 },
  { lat: 38.9231, lng: -77.0181, crime_type: "ASSAULT WITH DANGEROUS WEAPON", year: 2023 },
  // Moderate route
  { lat: 38.9250, lng: -77.0165, crime_type: "THEFT/OTHER", year: 2023 },
  { lat: 38.9255, lng: -77.0160, crime_type: "THEFT/AUTO", year: 2023 },
  // Safe route: no crimes nearby
];


beforeAll(() => {
  server = app.listen(process.env.PORT || 4000);
});

afterAll(() => {
  server.close();
});

// Helper to create request body
const createReqBody = (route, hour) => ({
  route,
  crimeData: dummyCrimes,
  timeOfDay: hour,
});

describe("POST /api/safetyScore", () => {
  test("Scores rank Unsafe < Moderate < Safe", async () => {
    const unsafeRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.unsafe, 14));
    const moderateRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.moderate, 14));
    const safeRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.safe, 14));

    expect(unsafeRes.body.safetyScore).toBeLessThan(moderateRes.body.safetyScore);
    expect(moderateRes.body.safetyScore).toBeLessThan(safeRes.body.safetyScore);

    // Optional: numeric expectations if you want deterministic test
    expect(unsafeRes.body.safetyScore).toBeLessThan(100);
    expect(safeRes.body.safetyScore).toBeGreaterThanOrEqual(100);
  });

  test("Scores decrease during higher risk hours", async () => {
    const morningRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.unsafe, 8));
    const eveningRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.unsafe, 19));
    const nightRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.unsafe, 23));

    expect(eveningRes.body.safetyScore).toBeLessThan(morningRes.body.safetyScore);
    expect(nightRes.body.safetyScore).toBeLessThan(morningRes.body.safetyScore);
    expect(nightRes.body.safetyScore).toBeLessThanOrEqual(eveningRes.body.safetyScore);
  });

  test("Handles edge case: empty route", async () => {
    const res = await request(app).post("/api/safetyScore").send({ route: [], crimeData: dummyCrimes });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No route provided");
  });

  test("Handles edge case: no crimes nearby", async () => {
    const res = await request(app)
      .post("/api/safetyScore")
      .send(createReqBody([{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0.001 }], 14));

    expect(res.body.safetyScore).toBeGreaterThanOrEqual(90);
    expect(res.body.crimesPerKm).toBeCloseTo(0, 0); // almost 0 crimes per km
  });
});
