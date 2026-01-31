import app from "./app.js";
import { 
  startDB, 
  getLatestCrimeDate, 
  updateCrimesFromDC,
} from "./db.js";

const PORT = process.env.PORT || 4000;


async function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

   if (process.env.NODE_ENV !== "test") {
          try {
          setInterval(async () => {
              try {
                await startDB();
              const lastDate = await getLatestCrimeDate();
              console.log("Starting hourly update from last crime date:", lastDate);
              await updateCrimesFromDC();
              console.log("Hourly update complete.");
              } catch (err) {
              console.error("Error updating crimes from DC:", err);
              }
          }, 3600000); // every hour
  
          console.log("Server will update crimes from DC every hour.");
          } catch (err) {
          console.error("Error setting up hourly updates:", err);
          }
      }
  await startDB();
}

startServer();
console.log("DB_SERVER", config.DB_SERVER)


