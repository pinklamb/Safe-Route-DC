let currentUserLocation;

export function getUserLocation() {
  return new Promise((resolve, reject) => {
    // if location is already saved
    if (currentUserLocation) return resolve(currentUserLocation);

    // Request location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lon = pos.coords.longitude;
          const lat = pos.coords.latitude;
          currentUserLocation = { lon, lat };

          const locationEl = document.getElementById("locationDisplay");
          if (locationEl) {
            locationEl.textContent = `Longitude: ${lon.toFixed(4)}, Latitude: ${lat.toFixed(4)}`;
          }

          resolve(currentUserLocation);
        },
        (err) => {
          console.error(err);
          alert("Could not get location. Please allow access.");
          reject(err);
        }
      );
    } else {
      alert("Geolocation is not supported by this browser.");
      reject("Geolocation not supported");
    }
  });
}









