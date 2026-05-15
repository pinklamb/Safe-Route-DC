import app from "./app.js";
import { 
  startDB, 
  getLatestCrimeDate, 
  updateCrimesFromDC,
} from "./db.js";

const PORT = process.env.PORT || 4000;


async function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running at 0.0.0.0:${PORT}`);
  });
 
}

async function scheduleUpdate() {
    try {
      await startDB();
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


