import { getUserLocation } from "./finduser.js";

let map, infoWindow, directionsService, routeRenderers = [], autocomplete;

async function loadGoogleMaps() {
  if (!window.google) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyBFynlILPg5OwVftguk0yN-dlR_FNVEQVQ&libraries=places,geometry&v=weekly";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Initialize map
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 38.9072, lng: -77.0369 },
    zoom: 13,
  });

  infoWindow = new google.maps.InfoWindow();
  directionsService = new google.maps.DirectionsService();

  // Autocomplete input
  const input = document.getElementById("destinationInput");
  autocomplete = new google.maps.places.Autocomplete(input);
  autocomplete.bindTo("bounds", map);

  // Location button
  const locationButton = document.getElementById("locationButton");
  locationButton.textContent = "Get Routes";
  locationButton.classList.add("custom-map-control-button");
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(locationButton);

  locationButton.addEventListener("click", async (event) => {
    event.preventDefault();

    let destination;
    const place = autocomplete.getPlace();
    if (!place || !place.geometry) {
      const address = input.value.trim();
      if (!address) return alert("Please enter a destination.");
      destination = await geocodeAddress(address);
    } else {
      destination = place.geometry.location;
    }

    try {
      const origin = await getUserLocation();
      calculateAndDisplayRoutes(origin, destination);
    } catch (err) {
      console.error(err);
      alert("Unable to get your location.");
    }
  });
}

// Geocode a typed address
async function geocodeAddress(address) {
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) resolve(results[0].geometry.location);
      else reject(status);
    });
  });
}

// Clear previous routes
function clearOldRoutes() {
  routeRenderers.forEach(r => r.setMap(null));
  routeRenderers = [];
  document.getElementById("routeInfo").innerHTML = "";
}

// helper to color routes based on safetyscore
function getRouteColor(score) {
  if (score > 80) return "green";
  if (score > 60) return "orange" 
  return "red";
}

// Calculate and display routes 
async function calculateAndDisplayRoutes(origin, destination) {
  directionsService.route(
    {
      origin,
      destination,
      travelMode: google.maps.TravelMode.WALKING,
      provideRouteAlternatives: true,
    },
    async (response, status) => {
      if (status !== "OK") return alert("Directions request failed: " + status);

      //clearOldRoutes();

      for (let i = 0; i < response.routes.length; i++) {
        const route = response.routes[i];
        const leg = route.legs[0];

        // Decode polyline to array of {lat, lng} for server
        const path = google.maps.geometry.encoding.decodePath(route.overview_polyline);
        const routeCoords = path.map(p => ({ lat: p.lat(), lng: p.lng() }));

        // get safety score from server
        const safetyData = await fetch("/api/safetyScore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route: routeCoords }),
        }).then(res => res.json());

        // color codes routes
        const renderer = new google.maps.DirectionsRenderer({
          map,
          directions: response,
          routeIndex: i,
          polylineOptions: { strokeColor: getRouteColor(safetyData.safetyScore), strokeWeight: 5, strokeOpacity: 0.8 },
        });
        routeRenderers.push(renderer);

        // show info on the side
        addRouteInfoToUI(i, leg, safetyData);
      }
    }
  );
}

// info for routes in sidebar
function addRouteInfoToUI(index, leg, safetyData) {
  const container = document.getElementById("routeInfo");
  const div = document.createElement("div");
  div.classList.add("route-card");
  div.innerHTML = `
    <strong>Route ${index + 1}</strong><br>
    Distance: ${leg.distance.text}<br>
    Time: ${leg.duration.text}<br>
    Safety Score: <b>${safetyData.safetyScore.toFixed(1)}</b>/100<br>
    Weighted Crimes Nearby: ${safetyData.weightedCrimeCount}
  `;
  container.appendChild(div);
}

loadGoogleMaps();












