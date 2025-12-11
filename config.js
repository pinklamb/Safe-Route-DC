import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

export const config = {
  PORT: process.env.PORT || 4000,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_SERVER: process.env.DB_SERVER,
  DB_NAME: process.env.DB_NAME,
  DB_PORT: process.env.DB_PORT,
  GOOGLE_MAPS_KEY: process.env.GOOGLE_MAPS_KEY
};

