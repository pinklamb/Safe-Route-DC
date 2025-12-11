import sql from "mssql";

export const testPool = new sql.ConnectionPool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,    
  port: 1435,                         
  database: "tempdb",                 
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
});

