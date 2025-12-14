
import app from "../app.js";
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

function generateCrimes(route, count, type = "THEFT/OTHER", year = 2025) {
  return Array(count).fill(0).map((_, i) => ({
    lat: route[0].lat + i * 0.0001,
    lng: route[0].lng + i * 0.0001,
    crime_type: type,
    year,
  }));
}


const allCrimes = [
  ...generateCrimes(testRoutes.unsafe, 600, "HOMICIDE"),
  ...generateCrimes(testRoutes.moderate, 100, "ROBBERY"),
  ...generateCrimes(testRoutes.safe, 500, "THEFT/OTHER"),
  ...[2018,2019,2020,2021,2022,2023,2024,2025].map(year => ({
    lat: 38.9300,
    lng: -77.0100,
    crime_type: "THEFT/OTHER",
    year,
  })),
];


describe("POST /api/safetyScore with in-memory crimes", () => {

  test("Scores rank Unsafe < Moderate < Safe", async () => {
    const unsafeRes = await request(app)
      .post("/api/safetyScore")
      .send({ route: testRoutes.unsafe, timeOfDay: 14, crimeData: allCrimes });

    const moderateRes = await request(app)
      .post("/api/safetyScore")
      .send({ route: testRoutes.moderate, timeOfDay: 14, crimeData: allCrimes });

    const safeRes = await request(app)
      .post("/api/safetyScore")
      .send({ route: testRoutes.safe, timeOfDay: 14, crimeData: allCrimes });

    expect(unsafeRes.body.safetyScore).toBeLessThan(moderateRes.body.safetyScore);
    expect(moderateRes.body.safetyScore).toBeLessThan(safeRes.body.safetyScore);
    expect(safeRes.body.safetyScore).toBeGreaterThanOrEqual(90);
    expect(unsafeRes.body.safetyScore).toBeLessThan(100);

    
  });
  test("Scores decrease during higher risk hours", async () => {
    const morningRes = await request(app)
      .post("/api/safetyScore")
      .send({ route: testRoutes.safe, timeOfDay: 8, crimeData: allCrimes });

    const eveningRes = await request(app)
      .post("/api/safetyScore")
      .send({ route: testRoutes.safe, timeOfDay: 18, crimeData: allCrimes });

    const nightRes = await request(app)
      .post("/api/safetyScore")
      .send({ route: testRoutes.safe, timeOfDay: 23, crimeData: allCrimes });

    expect(eveningRes.body.safetyScore).toBeLessThan(morningRes.body.safetyScore);
    expect(nightRes.body.safetyScore).toBeLessThan(morningRes.body.safetyScore);
    expect(nightRes.body.safetyScore).toBeLessThanOrEqual(eveningRes.body.safetyScore);
  });

  test("Handles edge case: empty route", async () => {
    const res = await request(app)
      .post("/api/safetyScore")
      .send({ route: [], crimeData: allCrimes });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No route provided");
  });

  test("Handles edge case: no crimes nearby", async () => {
    const res = await request(app)
      .post("/api/safetyScore")
      .send({ route: [{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0.001 }], crimeData: allCrimes });
    expect(res.body.safetyScore).toBeGreaterThanOrEqual(90);
    expect(res.body.crimesPerKm).toBeCloseTo(0, 0);
  });
});


describe("Crime data was added successfully", () => {
  const recentYears = [2018,2019,2020,2021,2022,2023,2024,2025];

  test("At least one crime per recent year exists", () => {
    const yearsInData = allCrimes.map(c => c.year);
    recentYears.forEach(year => {
      expect(yearsInData).toContain(year);
    });
  });

  test("At least one crime in the most recent year", () => {
    const mostRecentYear = Math.max(...recentYears);
    const crimesThisYear = allCrimes.filter(c => c.year === mostRecentYear);
    expect(crimesThisYear.length).toBeGreaterThan(0);
  });
});
