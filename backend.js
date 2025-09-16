// backend.js
const express = require("express");
const fetch = require("node-fetch");
const app = express();
const PORT = 3000;



app.listen(PORT, () => {
  console.log(`Server working at http://localhost:${PORT}`);
});


app.get("/api/crimes", async (req, res) => {
  try {
    const response = await fetch(
      "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Public_Safety_WebMercator/MapServer/7/query?where=1%3D1&outFields=*&outSR=4326&f=json"

    );
    const data = await response.json();
    console.log("Data Received:", data.features.length, "records");

    res.json(data);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});


