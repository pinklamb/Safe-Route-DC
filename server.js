
const express = require("express");
const fetch = require("node-fetch");
const app = express();
const PORT = 3000;



app.listen(PORT, () => {
  console.log(`Server working at http://localhost:${PORT}`);
});


app.get("/api/crimes", async (req, res) => {
  try {
    const { minLon, minLat, maxLon, maxLat } = req.query;
    let url = "https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/FeatureServer/32/query?where=1%3D1&outFields=CCN,REPORT_DAT,SHIFT,METHOD,OFFENSE,BLOCK,XBLOCK,YBLOCK,LATITUDE,LONGITUDE,BID,START_DATE,END_DATE&outSR=4326&f=json";

   if (minLon && minLat && maxLon && maxLat) {
      url = `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Public_Safety_WebMercator/MapServer/7/query?geometry=${minLon},${minLat},${maxLon},${maxLat}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&f=json`;
    }
    const response = await fetch(url.replace(/\s/g, ""));
   const data = await response.json();
   console.log("Data Received:", data.features?.length || 0, "records");

    res.json(data.features || []);

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});




