import { getUserLocation } from "./finduser.js";

// Map Initialization
const map = L.map("map").setView([38.8951, -77.0364], 13); // Default DC
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

let routeLayer; // Current route
let userMarker; // User location marker

// Parse coordinates input
function parseCoordinates(input) {
  const match = input.match(/^\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*$/);
  if (!match) return null;
  return { lon: parseFloat(match[2]), lat: parseFloat(match[1]) };
}




// Show user on map
function showUserOnMap(location) {
  if (!location) return;
  const { lon, lat } = location;

  if (userMarker) userMarker.remove();
  userMarker = L.marker([lat, lon]).addTo(map).bindPopup("You are here").openPopup();
}

// Draw route on map using backend /api/route
async function drawRoute(start, end) {
  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start, end }),
  });

  if (!res.ok) throw new Error("Failed to fetch route from server");
  const routeData = await res.json();

  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.geoJSON(routeData, { style: { color: "red", weight: 3 } }).addTo(map);
  map.fitBounds(routeLayer.getBounds());
}

// DOM Elements
const inputEl = document.getElementById("destinationInput");
const form = document.getElementById("destinationForm");
const listEl = document.getElementById("autocompleteList");
const distanceEl = document.getElementById("distanceDisplay");
const locationEl = document.getElementById("locationDisplay");

// Autocomplete logic
inputEl.addEventListener("input", async () => {
  const query = inputEl.value.trim();
  if (!query) {
    listEl.style.display = "none";
    return;
  }

  try {
    const res = await fetch("/api/autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();

    listEl.innerHTML = "";
    if (!data.features || data.features.length === 0) {
      listEl.style.display = "none";
      return;
    }

    data.features.forEach((f) => {
      const li = document.createElement("li");
      li.textContent = f.properties.label;
      li.addEventListener("click", () => {
        inputEl.value = li.textContent;
        listEl.style.display = "none";
      });
      listEl.appendChild(li);
    });
    listEl.style.display = "block";
  } catch (err) {
    console.error("Autocomplete error:", err);
    listEl.style.display = "none";
  }
});

// Form submit logic
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const input = inputEl.value.trim();
  if (!input) return alert("Enter a destination first!");

  try {
    // Get user location (awaits the Promise)
    const userLocation = await getUserLocation();
    showUserOnMap(userLocation);

    let destination = parseCoordinates(input);

    // Geocode if input is not coordinates
    if (!destination) {
      const geoRes = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: input }),
      });
      const geoData = await geoRes.json();

      if (!geoData.features || geoData.features.length === 0) {
        return alert("Could not find that destination!");
      }

      const [lon, lat] = geoData.features[0].geometry.coordinates;
      destination = { lon, lat };
    }

    // Calculate distance
    const distRes = await fetch("/api/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userLocation, destination }),
    });
    const distData = await distRes.json();

    if (distData.distance != null) {
      distanceEl.textContent = `Distance: ${distData.distance.toFixed(2)} km`;
    } else {
      distanceEl.textContent = "Distance: N/A";
      console.warn("Distance not returned from server:", distData);
    }

    // Draw route
    await drawRoute(userLocation, destination);
  } catch (err) {
    console.error("Routing error:", err);
  }
});












