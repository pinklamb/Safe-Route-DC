


export function attachStartRouteButton(routeCard, index, safetyData, directionsResponseGlobal, map, routeRenderers) {
  const startBtn = document.createElement("button");
  startBtn.textContent = "Start Route";
  startBtn.classList.add("start-route-btn");
  startBtn.style.display = "none";
  routeCard.appendChild(startBtn);

  routeCard.addEventListener("click", () => {
    document.querySelectorAll(".route-card").forEach(c => c.classList.remove("selected"));
    routeCard.classList.add("selected");

    document.querySelectorAll(".start-route-btn").forEach(b => b.style.display = "none");
    startBtn.style.display = "inline-block";

   
    routeRenderers.forEach(r => r.setMap(null));
    routeRenderers.length = 0;

    // Draw polyline
    const renderer = new google.maps.DirectionsRenderer({
      map,
      directions: directionsResponseGlobal,
      routeIndex: index,
      polylineOptions: {
        strokeColor: getRouteColor(safetyData.safetyScore),
        strokeWeight: 6,
        strokeOpacity: 1
      }
    });
    routeRenderers.push(renderer);

    const path = google.maps.geometry.encoding.decodePath(
      directionsResponseGlobal.routes[index].overview_polyline.points
    );
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
  });

  startBtn.addEventListener("click", () => {
    let panel = document.getElementById("directionsPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "directionsPanel";
      panel.style.position = "absolute";
      panel.style.top = "10px";
      panel.style.right = "10px";
      panel.style.width = "300px";
      panel.style.maxHeight = "80%";
      panel.style.overflowY = "auto";
      panel.style.backgroundColor = "white";
      panel.style.padding = "10px";
      panel.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
      document.body.appendChild(panel);
    } else {
      panel.innerHTML = "";
    }

    const panelRenderer = new google.maps.DirectionsRenderer({
      map,
      directions: directionsResponseGlobal,
      routeIndex: index,
      panel: panel,
      suppressMarkers: false
    });

 
    routeRenderers.push(panelRenderer);
  });
}




export function getRouteColor(score) {
  if (score >= 85) return "#127e3fff";  
  if (score >= 65) return "#efca35ff";  
  if (score >= 40) return "#cf670dff";  
  return "#e12e1aff"; 
}

