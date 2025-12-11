import app from "./app.js";
import { 
  startDB, 
  getLatestCrimeDate, 
  updateCrimesFromDC
} from "./db.js";

const PORT = process.env.PORT || 4000;

async function startServer() {

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  await startDB();
  await updateCrimesFromDC();
  if (process.env.NODE_ENV !== "test") {
    try {
      setInterval(async () => {
        try {
          const lastDate = await getLatestCrimeDate();
          console.log("Starting hourly update from last crime date:", lastDate);
          await updateCrimesFromDC();
          console.log("Hourly update complete.");
        } catch (err) {
          console.error("Error updating crimes from DC:", err);
        }
      }, 3600000);

      console.log("Server will update crimes from DC every hour.");

    } catch (err) {
      console.error("Error setting up hourly updates:", err);
    }
  }
}
startServer();
export default app;

