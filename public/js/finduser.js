let currentUserLocation;

export async function getUserLocation() {
  return new Promise((resolve, reject) => {
    localStorage.removeItem('currentUserLocation');
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          currentUserLocation = { lat, lng };

          const locationEl = document.getElementById("locationDisplay");
          if (locationEl) {
            locationEl.textContent = `Longitude: ${lng.toFixed(4)}, Latitude: ${lat.toFixed(4)}`;
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










