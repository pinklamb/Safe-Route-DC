import app from "./app.js";
import { initDB, getLatestCrimeDate, updateCrimesFromDC} from "./db.js";

const PORT = process.env.PORT || 4000;

async function startServer() {
  await initDB();
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

  // Only fetch crimes in production (not during tests)
  if (process.env.NODE_ENV !== "test") {
    const lastDate = await getLatestCrimeDate();
    await updateCrimesFromDC(lastDate);

    setInterval(async () => {
      const lastDate = await getLatestCrimeDate();
      await updateCrimesFromDC(lastDate);
    }, 3600000);
  }
}

// Only run server if not testing
if (process.env.NODE_ENV !== "test") {
  startServer().catch(err => console.error("Server failed to start:", err));
}

export default app;
