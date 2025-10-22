function getLocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(showUserPosition, showError);
  } else {
    alert("Geolocation is not supported by this browser.");
  }
}






function showUserPosition(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  document.getElementById("locationDisplay").textContent =
    `Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}`;

  fetch(`/api/crimes?minLon=${lon - 0.01}&minLat=${lat - 0.01}&maxLon=${lon + 0.01}&maxLat=${lat + 0.01}`)
    .then(res => res.json())
    .then(data => {
      console.log("Nearby crimes:", data);
      document.getElementById("crimeCount").textContent =
        `Nearby crimes: ${data.length}`;
    })
    .catch(err => console.error(err));

  const locationEl = document.getElementById("locationDisplay");
  const crimeEl = document.getElementById("crimeCount");
  if (locationEl) locationEl.textContent = `Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}`;
  if (crimeEl) crimeEl.textContent = `Nearby crimes: ${data.length}`;

}





function showError(error) {
  console.error(error);
  alert("Could not get location");
}

window.onload = getLocation;



