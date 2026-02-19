import app from "./app.js";
import { 
  startDB, 
  getLatestCrimeDate, 
  updateCrimesFromDC,
} from "./db.js";

const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

async function startServer() {
  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
  });
 
}

async function scheduleUpdate() {
    try {
      await startDB();
      const lastDate = await getLatestCrimeDate();
      console.log("Starting update from:", lastDate);
      await updateCrimesFromDC();
      console.log("Update completed successfully.");
    } catch (err) {
      console.error("Update failed:", err);
    } finally {
      setTimeout(scheduleUpdate, 3600000);
    }
}


startServer();
scheduleUpdate();


