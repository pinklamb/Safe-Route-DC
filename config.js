import dotenv from "dotenv";
dotenv.config();

export const config = {
  PORT: process.env.PORT || 4000,
  api_key: process.env.api_key,
  GOOGLE_MAPS_KEY: process.env.GOOGLE_MAPS_KEY,


  DATABASE_URL: process.env.DATABASE_URL || null, 
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_SERVER: process.env.DB_SERVER,
  DB_NAME: process.env.DB_NAME,
  DB_PORT: process.env.DB_PORT,
};


