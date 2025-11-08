import request from "supertest";
import app from "../app.js";



// Unsafe: close to violent crimes
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

// dummyCrimes aligned to make Unsafe > Moderate > Safe
const dummyCrimes = [
  { lat: 38.9230, lng: -77.0180, crime_type: "ASSAULT" },  // Unsafe
  { lat: 38.9235, lng: -77.0175, crime_type: "ROBBERY" },  // Unsafe
  { lat: 38.9250, lng: -77.0165, crime_type: "THEFT" },    // Moderate
  { lat: 38.9255, lng: -77.0160, crime_type: "THEFT" },    // Moderate
  // Safe has no crimes nearby
];



beforeAll(() => {
  server = app.listen(process.env.PORT || 4000);
});

afterAll(() => {
  server.close();
});

// Helper to simulate time of day
const createReqBody = (route, hour) => ({
  route,
  crimeData: dummyCrimes,
  timeOfDay: hour, 
});


describe("POST /api/safetyScore", () => {

  test("Scores should rank Unsafe < Moderate < Safe", async () => {
    const unsafeRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.unsafe, 14));
    const moderateRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.moderate, 14));
    const safeRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.safe, 14));

    expect(unsafeRes.body.score).toBeLessThan(moderateRes.body.score);
    expect(moderateRes.body.score).toBeLessThan(safeRes.body.score);
  });

  test("Scores should vary by time of day", async () => {
    const morningRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.moderate, 8));
    const eveningRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.moderate, 18));
    const nightRes = await request(app).post("/api/safetyScore").send(createReqBody(testRoutes.moderate, 23));


    console.log(
      "Morning score:", morningRes.body.score,
      "| Evening score:", eveningRes.body.score,
      "| Night score:", nightRes.body.score
    );


    // Higher risk at night = lower score
    expect(nightRes.body.score).toBeLessThan(morningRes.body.score);
    expect(eveningRes.body.score).toBeLessThan(morningRes.body.score);
    expect(nightRes.body.score).toBeLessThan(eveningRes.body.score);
  });

});


