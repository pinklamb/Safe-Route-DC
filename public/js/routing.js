import { getUserLocation } from "./finduser.js";
import { attachStartRouteButton, getRouteColor } from "./loadroutes.js";


let map, directionsService, routeRenderers = [];
let destinationAutocomplete, startAutocomplete;
let directionsResponseGlobal;

async function loadGoogleMaps() {
  if (!window.google) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyCLIxiCKRuw_BH9fZuxmC3pryHtgcjN75U&libraries=places,geometry&v=weekly";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }


  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 38.9072, lng: -77.0369 },
    zoom: 12,
    mapTypeControl: false,
    fullscreenControl: true,
    streetViewControl: false
  });

  directionsService = new google.maps.DirectionsService();
  const infoWindow = new google.maps.InfoWindow();



  const DC_BOUNDS = new google.maps.LatLngBounds(
    { lat: 38.7916, lng: -77.1198 }, 
    { lat: 38.9955, lng: -76.9094 }  
  );

  const destinationInput = document.getElementById("destinationInput");
  const startInput = document.getElementById("startInput");


  destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, {
    bounds: DC_BOUNDS,
    strictBounds: true
  });
  startAutocomplete = new google.maps.places.Autocomplete(startInput, {
    bounds: DC_BOUNDS,
    strictBounds: true
  });


  navigator.permissions.query({ name: "geolocation" }).then(async (res) => {
    if (res.state === "granted") {
      try {
        const userLocation = await getUserLocation();
        const address = await reverseGeocode(userLocation.lat, userLocation.lng);
        startInput.value = address;
      } catch (err) {
        console.error("Error auto-filling user location:", err);
      }
    }
  });


  const locationIcon = document.querySelector(".location-icon");
  locationIcon.addEventListener("click", async () => {
    try {
      const userLocation = await getUserLocation();
      const address = await reverseGeocode(userLocation.lat, userLocation.lng);
      startInput.value = address;
    } catch (err) {
      console.error("Location lookup failed:", err);
    }
  });

  const locationButton = document.getElementById("routeButton");
  locationButton.textContent = "Find Routes";
  locationButton.classList.add("custom-map-control-button");

  const routeForm = document.getElementById("routeForm");
  routeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    locationButton.click();
  });

  locationButton.addEventListener("click", async (event) => {
    event.preventDefault();

    const destination = await getPlaceOrGeocode(destinationInput, destinationAutocomplete);
    if (!destination) return alert("Please enter a destination.");

    const origin = await getPlaceOrGeocode(startInput, startAutocomplete, true);
    if (!origin) return alert("Unable to get your location or starting point.");

    await calculateAndDisplayRoutes(origin, destination);
  });
}


async function reverseGeocode(lat, lng) {
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results[0]) resolve(results[0].formatted_address);
      else reject(status);
    });
  });
}



async function getPlaceOrGeocode(inputElement, autocomplete, useUserLocation = false) {
  const place = autocomplete.getPlace();
  if (place && place.geometry) return place.geometry.location;

  const address = inputElement.value.trim();
  if (address) return await geocodeAddress(address);

  if (useUserLocation) {
    try {
      const loc = await getUserLocation();
      return new google.maps.LatLng(loc.lat, loc.lng);
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  return null;
}

async function geocodeAddress(address) {
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) resolve(results[0].geometry.location);
      else reject(status);
    });
  });
}

//DC only locations
async function validateDC(latLng) {
  const geocoder = new google.maps.Geocoder();
  const results = await new Promise((resolve, reject) => {
    geocoder.geocode({ location: latLng }, (res, status) => {
      if (status === "OK") resolve(res);
      else reject(status);
    });
  });

  return results.some(r => r.formatted_address.toLowerCase().includes("washington, dc"));
}


function clearOldRoutes() {
  routeRenderers.forEach(r => r.setMap(null));
  routeRenderers = [];
  document.getElementById("routeInfo").innerHTML = "";
}


async function calculateAndDisplayRoutes(origin, destination) {
  try {
    if (!(await validateDC(origin))) {
      alert("Start location must be in Washington, DC.");
      return;
    }
    if (!(await validateDC(destination))) {
      alert("Destination must be in Washington, DC.");
      return;
    }
  } catch (error) {
    console.error("Error validating location:", error);
    return;
  }

  directionsService.route(
    {
      origin,
      destination,
      travelMode: google.maps.TravelMode.WALKING,
      provideRouteAlternatives: true
    },
    async (response, status) => {
      if (status !== "OK") return alert("Directions request failed: " + status);

      directionsResponseGlobal = response;
      clearOldRoutes();

      const infoContainer = document.getElementById("routeInfo");
      infoContainer.style.visibility = "visible";
      infoContainer.innerHTML = "<em>Calculating safety scores...</em>";

      const routeCards = [];

      for (let i = 0; i < response.routes.length; i++) {
        const route = response.routes[i];
        const leg = route.legs[0];
        const path = google.maps.geometry.encoding.decodePath(route.overview_polyline);
        const routeCoords = path.map(p => ({ lat: p.lat(), lng: p.lng() }));
        const originCoords = origin.lat && origin.lng ? origin : { lat: origin.lat(), lng: origin.lng() };

        const safetyData = await fetch("/api/safetyScore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route: routeCoords, start: originCoords }),
        }).then(res => res.json())
          .catch(() => ({ safetyScore: 0, crimesPerKm: 0 }));

        const renderer = new google.maps.DirectionsRenderer({
          map,
          directions: response,
          routeIndex: i,
          polylineOptions: {
            strokeColor: getRouteColor(safetyData.safetyScore),
            strokeWeight: 4,
            strokeOpacity: 0.5
          },
        });
        routeRenderers.push(renderer);

        const card = addRouteInfoToUI(i, leg, safetyData);
        routeCards.push(card);
      }

      infoContainer.innerHTML = "";
      routeCards.forEach(card => infoContainer.appendChild(card));
    }
  );
}

function addRouteInfoToUI(index, leg, safetyData) {
  const div = document.createElement("div");
  div.classList.add("route-card");

  const safetyLabel =
    safetyData.safetyScore >= 80 ? "Safe" :
    safetyData.safetyScore >= 65 ? "Moderate" :
    safetyData.safetyScore >= 59 ? "Risky" : "Unsafe";

  div.innerHTML = `
    <strong>Route ${index + 1}</strong><br>
    Distance: ${leg.distance.text}<br>
    Time: ${leg.duration.text}<br>
    Safety: <b style="color:${getRouteColor(safetyData.safetyScore)}">${safetyLabel}</b> (${safetyData.safetyScore.toFixed(1)}/100)<br>
    Crimes per Km: ${safetyData.crimesPerKm.toFixed(1)}<br>
    Weighted Crime Score: ${safetyData.weightedCrimeCount?.toFixed(1) ?? "N/A"}<br>
    <small>Note: Crime density may appear high because the database contains over 200,000 incidents in DC.</small>
  `;

  attachStartRouteButton(div, index, safetyData, directionsResponseGlobal, map, routeRenderers);
  return div;
}


loadGoogleMaps();

