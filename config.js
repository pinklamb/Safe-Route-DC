import dotenv from "dotenv";
dotenv.config();

export const config = {
  PORT: process.env.PORT || 4000,
  DATABASE_URL: process.env.DATABASE_URL,
  GOOGLE_MAPS_KEY: process.env.GOOGLE_MAPS_KEY,
};



