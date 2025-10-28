import fetch from "node-fetch";

// Haversine formula to calculate distance for tests
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; 
  const toRad = (deg) => deg * (Math.PI / 180);

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Test function using White House
async function testUserLocation() {
  const userLat = 38.8977;
  const userLon = -77.0365;

  try {
    // Fetch nearby crimes
    const url = `http://localhost:${process.env.PORT || 4000}/api/crimes?minLat=${userLat - 0.01}&maxLat=${userLat + 0.01}&minLon=${userLon - 0.01}&maxLon=${userLon + 0.01}`;
    const res = await fetch(url);
    const crimes = await res.json();

    console.log(`Test location: Lat ${userLat}, Lon ${userLon}`);
    console.log(`Nearby crimes found: ${crimes.length}`);

    if (crimes.length === 0) return;

    // locate closest crime
    let closest = crimes[0];
    let minDist = getDistance(userLat, userLon, closest.latitude, closest.longitude);

    for (const crime of crimes) {
      const dist = getDistance(userLat, userLon, crime.latitude, crime.longitude);
      if (dist < minDist) {
        minDist = dist;
        closest = crime;
      }
    }

    console.log("Closest crime:");
    console.log(`- Type: ${closest.crime_type}`);
    console.log(`- Date: ${closest.date_occurred}`);
    console.log(`- Address: ${closest.address}`);
    console.log(`- Distance: ${minDist.toFixed(0)} meters`);

  } catch (err) {
    console.error("Error fetching crimes:", err);
  }
}


testUserLocation();
