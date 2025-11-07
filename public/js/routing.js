import { getUserLocation } from "./finduser.js";

let map, infoWindow, directionsService, routeRenderers = [], destinationAutocomplete, startAutocomplete;

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

  // Initialize map
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 38.9226, lng: -77.0194 },
    zoom: 16,
  });

  infoWindow = new google.maps.InfoWindow();
  directionsService = new google.maps.DirectionsService();

  // Autocomplete for destination and start
  const destinationInput = document.getElementById("destinationInput");
  const startInput = document.getElementById("startInput");

  destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput);
  destinationAutocomplete.bindTo("bounds", map);

  startAutocomplete = new google.maps.places.Autocomplete(startInput);
  startAutocomplete.bindTo("bounds", map);

  // Button click
  const locationButton = document.getElementById("routeButton");
  locationButton.textContent = "Get Routes";
  locationButton.classList.add("custom-map-control-button");
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(locationButton);


  const routeForm = document.getElementById("routeForm"); 
  routeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    document.getElementById("routeButton").click(); // enter button 
  });


  locationButton.addEventListener("click", async (event) => {
    event.preventDefault();

    // Destination
    let destination;
    const destPlace = destinationAutocomplete.getPlace();
    if (!destPlace || !destPlace.geometry) {
      const address = destinationInput.value.trim();
      if (!address) return alert("Please enter a destination.");
      destination = await geocodeAddress(address);
    } else {
      destination = destPlace.geometry.location;
    }

    // Origin (either typed or user location)
    let origin;
    const startPlace = startAutocomplete.getPlace();
    if (!startPlace || !startPlace.geometry) {
      const address = startInput.value.trim();
      if (!address) {
        try {
          origin = await getUserLocation();
        } catch (err) {
          console.error(err);
          return alert("Unable to get your location.");
        }
      } else {
        origin = await geocodeAddress(address);
      }
    } else {
      origin = startPlace.geometry.location;
    }

    calculateAndDisplayRoutes(origin, destination);
  });
}


// Geocode typed address
async function geocodeAddress(address) {
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) resolve(results[0].geometry.location);
      else reject(status);
    });
  });
}

// Clear old routes
function clearOldRoutes() {
  routeRenderers.forEach(r => r.setMap(null));
  routeRenderers = [];
  document.getElementById("routeInfo").innerHTML = "";
}

// Calculate & display routes
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

      clearOldRoutes();
      const infoContainer = document.getElementById("routeInfo");
      infoContainer.innerHTML = "<em>Calculating safety scores...</em>";

      const routeCards = [];

      for (let i = 0; i < response.routes.length; i++) {
        const route = response.routes[i];
        const leg = route.legs[0];
        const path = google.maps.geometry.encoding.decodePath(route.overview_polyline);
        const routeCoords = path.map(p => ({ lat: p.lat(), lng: p.lng() }));


    let originCoords;
    if (origin.lat && origin.lng) {
      // already plain object
      originCoords = origin;
    } else {
      // Google LatLng object
      originCoords = { lat: origin.lat(), lng: origin.lng() };
    }


      const safetyData = await fetch("/api/safetyScore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route: routeCoords, start: originCoords }),
      }).then(res => res.json())
        .catch(() => ({ safetyScore: 0, crimesPerKm: 0 }));




        // Draw route
        const renderer = new google.maps.DirectionsRenderer({
          map,
          directions: response,
          routeIndex: i,
          polylineOptions: {
            strokeColor: getRouteColor(safetyData.safetyScore),
            strokeWeight: 5,
            strokeOpacity: 0.8
          },
        });
        routeRenderers.push(renderer);

        // Create UI card
        routeCards.push(addRouteInfoToUI(i, leg, safetyData));
      }

      infoContainer.innerHTML = "";
      routeCards.forEach(card => infoContainer.appendChild(card));
    }
  );
}

// Create route info card
function addRouteInfoToUI(index, leg, safetyData) {
  const div = document.createElement("div");
  div.classList.add("route-card");

  const safetyLabel = safetyData.safetyScore >= 80 ? "Safe" :
                      safetyData.safetyScore >= 65 ? "Moderate" :
                      safetyData.safetyScore >= 59 ? "Risky" : "Unsafe";

  div.innerHTML = `
    <strong>Route ${index + 1}</strong><br>
    Distance: ${leg.distance.text}<br>
    Time: ${leg.duration.text}<br>
    Safety: <b style="color:${getRouteColor(safetyData.safetyScore)}">
      ${safetyLabel}</b> (${safetyData.safetyScore.toFixed(1)}/100)<br>
    Crimes per Km: ${safetyData.crimesPerKm}
  `;
  return div;
}

// Route color based on score
function getRouteColor(score) {
  if (score >= 85) return "#127e3fff";
  if (score >= 65) return "#efca35ff";
  if (score >= 40) return "#cf670dff";
  return "#e12e1aff";
}

loadGoogleMaps();













