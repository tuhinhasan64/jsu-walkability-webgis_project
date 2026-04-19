const map = L.map("map", {
  zoomControl: true
}).setView([33.8229, -85.7661], 17);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 22,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const resultBox = document.getElementById("resultBox");
const startSelect = document.getElementById("startSelect");
const endSelect = document.getElementById("endSelect");
const findRouteBtn = document.getElementById("findRouteBtn");
const resetBtn = document.getElementById("resetBtn");
const paceSelect = document.getElementById("paceSelect");

let buildingsLayer, parkingLayer, nodesLayer;
let grayEdgesLayer = null;
let altRouteLayer = null;
let bestRouteLayer = null;

const nodeNameMap = {
  N1: "Martin Entrance",
  N2: "Library Entrance",
  N3: "Parking A",
  N4: "Central Junction",
  N5: "South Connector",
  N6: "Martin Secondary Entrance",
  N7: "Library Secondary Access",
  N8: "Parking B",
  N9: "East Connector",
  N10: "Cross Connector"
};

const visibleLabelNodes = new Set(["N1", "N2", "N3", "N6", "N7", "N8"]);

function updateResult(html) {
  resultBox.innerHTML = html;
}

function getSelectableNodes() {
  return ["N1", "N2", "N3", "N6", "N7", "N8"];
}

function refreshDropdowns() {
  const allNodes = getSelectableNodes();
  const currentStart = startSelect.value;
  const currentEnd = endSelect.value;

  startSelect.innerHTML = `<option value="">Select start point</option>`;
  allNodes
    .filter((id) => id !== currentEnd)
    .forEach((id) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = nodeNameMap[id];
      if (id === currentStart) option.selected = true;
      startSelect.appendChild(option);
    });

  endSelect.innerHTML = `<option value="">Select end point</option>`;
  allNodes
    .filter((id) => id !== currentStart)
    .forEach((id) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = nodeNameMap[id];
      if (id === currentEnd) option.selected = true;
      endSelect.appendChild(option);
    });
}

function buildingStyle() {
  return {
    color: "#8f96a3",
    weight: 1,
    fillColor: "#bfc5cd",
    fillOpacity: 0.45
  };
}

function parkingStyle() {
  return {
    color: "#9a9588",
    weight: 1,
    fillColor: "#d9d6cf",
    fillOpacity: 0.35
  };
}

function grayEdgeStyle() {
  return {
    color: "#9ca3af",
    weight: 3,
    opacity: 0.72
  };
}

function altRouteStyle() {
  return {
    color: "#f59e0b",
    weight: 5,
    opacity: 0.95
  };
}

function bestRouteStyle() {
  return {
    color: "#c2410c",
    weight: 6,
    opacity: 1
  };
}

function hiddenEdgeStyle() {
  return {
    color: "#9ca3af",
    weight: 3,
    opacity: 0
  };
}

function nodeStyle(feature) {
  const props = feature.properties || {};
  const isEntrance = props.category === "Entrance";
  const isParking = props.category === "ParkingAccess";

  return {
    radius: isEntrance ? 7 : isParking ? 7 : 6,
    fillColor: "#c62828",
    color: "#ffffff",
    weight: 1.5,
    opacity: 1,
    fillOpacity: 0.95
  };
}

function buildEdgeIndex(edgesGeojson) {
  const edgeIndex = {};
  edgesGeojson.features.forEach((feature) => {
    const props = feature.properties || {};
    if (props.edge_id) edgeIndex[props.edge_id] = feature;
  });
  return edgeIndex;
}

function buildGraph(edgesGeojson) {
  const graph = {};

  edgesGeojson.features.forEach((feature) => {
    const props = feature.properties || {};
    const from = props.from_node;
    const to = props.to_node;
    const length = Number(props.length_m) || Number(props.Shape_Length) || 0;

    if (!from || !to || !length) return;

    if (!graph[from]) graph[from] = [];
    if (!graph[to]) graph[to] = [];

    graph[from].push({ node: to, weight: length, edgeId: props.edge_id });
    graph[to].push({ node: from, weight: length, edgeId: props.edge_id });
  });

  return graph;
}

function shortestPath(graph, start, end) {
  const distances = {};
  const previous = {};
  const previousEdge = {};
  const unvisited = new Set(Object.keys(graph));

  Object.keys(graph).forEach((node) => {
    distances[node] = Infinity;
  });

  if (!(start in graph) || !(end in graph)) return null;

  distances[start] = 0;

  while (unvisited.size > 0) {
    let current = null;
    let smallest = Infinity;

    unvisited.forEach((node) => {
      if (distances[node] < smallest) {
        smallest = distances[node];
        current = node;
      }
    });

    if (current === null || distances[current] === Infinity) break;
    if (current === end) break;

    unvisited.delete(current);

    (graph[current] || []).forEach((neighbor) => {
      const alt = distances[current] + neighbor.weight;
      if (alt < distances[neighbor.node]) {
        distances[neighbor.node] = alt;
        previous[neighbor.node] = current;
        previousEdge[neighbor.node] = neighbor.edgeId;
      }
    });
  }

  if (distances[end] === Infinity) return null;

  const pathNodes = [];
  const pathEdges = [];
  let current = end;

  while (current) {
    pathNodes.unshift(current);
    if (previousEdge[current]) pathEdges.unshift(previousEdge[current]);
    current = previous[current];
  }

  return {
    distance: distances[end],
    nodes: pathNodes,
    edges: pathEdges,
    name: "Computed shortest route"
  };
}

function routeDistance(route, edgeIndex) {
  return route.edges.reduce((sum, edgeId) => {
    const feature = edgeIndex[edgeId];
    if (!feature) return sum;
    const props = feature.properties || {};
    const len = Number(props.length_m) || Number(props.Shape_Length) || 0;
    return sum + len;
  }, 0);
}

function normalizePairKey(start, end) {
  return `${start}-${end}`;
}

const modeledRouteSets = {
  "N8-N1": [
    {
      id: "R1",
      name: "Via Parking A and Central Junction",
      nodes: ["N8", "N3", "N4", "N1"],
      edges: ["E9", "E2", "E1"]
    },
    {
      id: "R2",
      name: "Via South Connector and East Connector",
      nodes: ["N8", "N5", "N9", "N3", "N4", "N1"],
      edges: ["E7", "E11", "E10", "E2", "E1"]
    },
    {
      id: "R3",
      name: "Via Cross Connector",
      nodes: ["N8", "N5", "N9", "N10", "N4", "N1"],
      edges: ["E7", "E11", "E13", "E12", "E1"]
    }
  ],
  "N8-N2": [
    {
      id: "R1",
      name: "Via South Connector",
      nodes: ["N8", "N5", "N2"],
      edges: ["E7", "E4"]
    },
    {
      id: "R2",
      name: "Via Parking A and East Connector",
      nodes: ["N8", "N3", "N9", "N5", "N2"],
      edges: ["E9", "E10", "E11", "E4"]
    },
    {
      id: "R3",
      name: "Via Library Secondary Access",
      nodes: ["N8", "N5", "N7", "N2"],
      edges: ["E7", "E6", "E8"]
    }
  ],
  "N8-N7": [
    {
      id: "R1",
      name: "Via South Connector",
      nodes: ["N8", "N5", "N7"],
      edges: ["E7", "E6"]
    },
    {
      id: "R2",
      name: "Via Parking A and Cross Connector",
      nodes: ["N8", "N3", "N9", "N10", "N7"],
      edges: ["E9", "E10", "E13"]
    }
  ],
  "N6-N8": [
    {
      id: "R1",
      name: "Via Martin Entrance and Parking A",
      nodes: ["N6", "N1", "N4", "N3", "N8"],
      edges: ["E14", "E1", "E2", "E9"]
    },
    {
      id: "R2",
      name: "Via Central Junction and Parking A",
      nodes: ["N6", "N4", "N3", "N8"],
      edges: ["E5", "E2", "E9"]
    },
    {
      id: "R3",
      name: "Via Cross Connector and South Connector",
      nodes: ["N6", "N4", "N10", "N9", "N5", "N8"],
      edges: ["E5", "E12", "E13", "E11", "E7"]
    }
  ],
  "N1-N2": [
    {
      id: "R1",
      name: "Main Route",
      nodes: ["N1", "N4", "N3", "N9", "N5", "N2"],
      edges: ["E1", "E2", "E10", "E11", "E4"]
    },
    {
      id: "R2",
      name: "Via Cross Connector and Library Secondary",
      nodes: ["N1", "N4", "N10", "N7", "N2"],
      edges: ["E1", "E12", "E13", "E8"]
    },
    {
      id: "R3",
      name: "Via Parking A and Library Secondary",
      nodes: ["N1", "N4", "N3", "N9", "N5", "N7", "N2"],
      edges: ["E1", "E2", "E10", "E11", "E6", "E8"]
    }
  ]
};

function getModeledRoutes(start, end, edgeIndex) {
  const key = normalizePairKey(start, end);
  const reverseKey = normalizePairKey(end, start);

  if (modeledRouteSets[key]) {
    return modeledRouteSets[key].map((route) => ({
      ...route,
      distance: routeDistance(route, edgeIndex)
    }));
  }

  if (modeledRouteSets[reverseKey]) {
    return modeledRouteSets[reverseKey].map((route) => {
      const reversedEdges = [...route.edges].reverse();
      const reversedNodes = [...route.nodes].reverse();
      return {
        ...route,
        name: `${route.name} (reverse)`,
        nodes: reversedNodes,
        edges: reversedEdges,
        distance: routeDistance({ edges: reversedEdges }, edgeIndex)
      };
    });
  }

  return null;
}

function clearRouteLayers() {
  if (grayEdgesLayer) {
    map.removeLayer(grayEdgesLayer);
    grayEdgesLayer = null;
  }
  if (altRouteLayer) {
    map.removeLayer(altRouteLayer);
    altRouteLayer = null;
  }
  if (bestRouteLayer) {
    map.removeLayer(bestRouteLayer);
    bestRouteLayer = null;
  }
}

function showComparedRoutes(allEdgesGeojson, bestRoute, alternatives) {
  clearRouteLayers();

  const usedBest = new Set(bestRoute.edges);
  const usedAlt = new Set(alternatives.flatMap((r) => r.edges));
  const allUsed = new Set([...usedBest, ...usedAlt]);

  const grayFeatures = allEdgesGeojson.features.filter((f) => {
    const id = f.properties?.edge_id;
    return !allUsed.has(id);
  });

  const altFeatures = allEdgesGeojson.features.filter((f) => {
    const id = f.properties?.edge_id;
    return usedAlt.has(id) && !usedBest.has(id);
  });

  const bestFeatures = allEdgesGeojson.features.filter((f) => {
    const id = f.properties?.edge_id;
    return usedBest.has(id);
  });

  grayEdgesLayer = L.geoJSON(
    { type: "FeatureCollection", features: grayFeatures },
    { style: hiddenEdgeStyle }
  ).addTo(map);

  if (altFeatures.length) {
    altRouteLayer = L.geoJSON(
      { type: "FeatureCollection", features: altFeatures },
      { style: altRouteStyle }
    ).addTo(map);
  }

  if (bestFeatures.length) {
    bestRouteLayer = L.geoJSON(
      { type: "FeatureCollection", features: bestFeatures },
      { style: bestRouteStyle }
    ).addTo(map);
  }
}

function showSingleBestRoute(allEdgesGeojson, bestPath) {
  clearRouteLayers();

  const usedBest = new Set(bestPath.edges);

  const grayFeatures = allEdgesGeojson.features.filter((f) => {
    const id = f.properties?.edge_id;
    return !usedBest.has(id);
  });

  const bestFeatures = allEdgesGeojson.features.filter((f) => {
    const id = f.properties?.edge_id;
    return usedBest.has(id);
  });

  grayEdgesLayer = L.geoJSON(
    { type: "FeatureCollection", features: grayFeatures },
    { style: hiddenEdgeStyle }
  ).addTo(map);

  bestRouteLayer = L.geoJSON(
    { type: "FeatureCollection", features: bestFeatures },
    { style: bestRouteStyle }
  ).addTo(map);
}

function formatClock(date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function calculateArrivalTime(minutesToAdd) {
  const now = new Date();
  const arrival = new Date(now.getTime() + minutesToAdd * 60000);
  return {
    now: formatClock(now),
    arrival: formatClock(arrival)
  };
}

function updateQrCode() {
  const qrBox = document.getElementById("qrBox");
  if (!qrBox) return;

  const currentUrl = window.location.href;
  qrBox.innerHTML = "";

  new QRCode(qrBox, {
    text: currentUrl,
    width: 130,
    height: 130,
    correctLevel: QRCode.CorrectLevel.M
  });
}

async function loadLayers() {
  const [buildingsRes, parkingRes, nodesRes, edgesRes] = await Promise.all([
    fetch("data/buildings.geojson"),
    fetch("data/parking.geojson"),
    fetch("data/nodes.geojson"),
    fetch("data/edges.geojson")
  ]);

  const buildings = await buildingsRes.json();
  const parking = await parkingRes.json();
  const nodes = await nodesRes.json();
  const edges = await edgesRes.json();

  buildingsLayer = L.geoJSON(buildings, {
    style: buildingStyle,
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      layer.bindPopup(`<b>${props.name || "Building"}</b><br>${props.type || ""}`);
    }
  }).addTo(map);

  parkingLayer = L.geoJSON(parking, {
    style: parkingStyle,
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      layer.bindPopup(`<b>${props.name || "Parking Area"}</b><br>${props.type || ""}`);
    }
  }).addTo(map);

  grayEdgesLayer = L.geoJSON(edges, {
    style: hiddenEdgeStyle,
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      layer.bindPopup(
        `<b>${props.edge_id || "Edge"}</b><br>From: ${props.from_node || "N/A"}<br>To: ${props.to_node || "N/A"}`
      );
    }
  }).addTo(map);

  nodesLayer = L.geoJSON(nodes, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, nodeStyle(feature)),
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      const nodeId = props.node_id || "";
      const displayName = nodeNameMap[nodeId] || props.name || nodeId || "Node";

      if (visibleLabelNodes.has(nodeId)) {
        const tooltipClass =
          props.category === "Entrance" || props.category === "ParkingAccess"
            ? "node-label-large"
            : "node-label-small";

        layer.bindTooltip(displayName, {
          permanent: true,
          direction: "top",
          offset: [0, -10],
          className: tooltipClass
        });
      }

      layer.bindPopup(
        `<b>${displayName}</b><br>ID: ${nodeId || "N/A"}<br>Category: ${props.category || "N/A"}<br>Degree: ${props.degree ?? "N/A"}`
      );
    }
  }).addTo(map);

  const all = L.featureGroup([buildingsLayer, parkingLayer, nodesLayer]);
  map.fitBounds(all.getBounds(), { padding: [30, 30] });

  const edgeIndex = buildEdgeIndex(edges);
  const graph = buildGraph(edges);

  findRouteBtn.addEventListener("click", () => {
    const start = startSelect.value;
    const end = endSelect.value;
    const pace = Number(paceSelect.value);

    if (!start || !end) {
      updateResult("Please select both a start and end point.");
      return;
    }

    if (start === end) {
      clearRouteLayers();
      grayEdgesLayer = L.geoJSON(edges, { style: hiddenEdgeStyle }).addTo(map);
      updateResult(
        `<div class="route-badge alert-badge">Route unavailable</div>
         <p>Start and end points are the same. Please choose different points.</p>`
      );
      return;
    }

    const modeledRoutes = getModeledRoutes(start, end, edgeIndex);

    if (modeledRoutes && modeledRoutes.length > 0) {
      const sortedRoutes = [...modeledRoutes].sort((a, b) => a.distance - b.distance);
      const quickest = sortedRoutes[0];
      const alternatives = sortedRoutes.slice(1);
      const longest = sortedRoutes[sortedRoutes.length - 1];

      showComparedRoutes(edges, quickest, alternatives);

      const quickestTime = (quickest.distance / pace) / 60;
      const longestTime = (longest.distance / pace) / 60;
      const arrivalInfo = calculateArrivalTime(quickestTime);

      updateResult(
        `<div class="route-badge">Quickest Path</div>
         <p><b>Start:</b> ${nodeNameMap[start]}</p>
         <p><b>End:</b> ${nodeNameMap[end]}</p>
         <p><b>Quickest Route:</b> ${quickest.name}</p>
         <p><b>Quickest Distance:</b> ${quickest.distance.toFixed(2)} m</p>
         <p><b>Estimated Quickest Time:</b> ${quickestTime.toFixed(2)} minutes</p>
         <p><b>Current Device Time:</b> ${arrivalInfo.now}</p>
         <p><b>Estimated Arrival Time:</b> ${arrivalInfo.arrival}</p>
         ${
           alternatives.length
             ? `<p><b>Longest Modeled Route:</b> ${longest.name}</p>
                <p><b>Longest Distance:</b> ${longest.distance.toFixed(2)} m</p>
                <p><b>Estimated Longest Time:</b> ${longestTime.toFixed(2)} minutes</p>`
             : `<p class="subtle">This is the only modeled route currently available for this origin-destination pair.</p>`
         }`
      );
      return;
    }

    const bestPath = shortestPath(graph, start, end);

    if (!bestPath) {
      clearRouteLayers();
      grayEdgesLayer = L.geoJSON(edges, { style: hiddenEdgeStyle }).addTo(map);
      updateResult(
        `<div class="route-badge alert-badge">Route unavailable</div>
         <p>A complete connected route is not currently mapped between <b>${nodeNameMap[start]}</b> and <b>${nodeNameMap[end]}</b>.</p>
         <p class="subtle alert-text">This origin-destination pair is still in progress in the current prototype network.</p>`
      );
      return;
    }

    showSingleBestRoute(edges, bestPath);

    const timeMinutes = (bestPath.distance / pace) / 60;
    const arrivalInfo = calculateArrivalTime(timeMinutes);

    updateResult(
      `<div class="route-badge">Quickest Path</div>
       <p><b>Start:</b> ${nodeNameMap[start]}</p>
       <p><b>End:</b> ${nodeNameMap[end]}</p>
       <p><b>Total Length:</b> ${bestPath.distance.toFixed(2)} m</p>
       <p><b>Estimated Walking Time:</b> ${timeMinutes.toFixed(2)} minutes</p>
       <p><b>Current Device Time:</b> ${arrivalInfo.now}</p>
       <p><b>Estimated Arrival Time:</b> ${arrivalInfo.arrival}</p>
       <p class="subtle">This is the shortest connected route currently available in the modeled network. No alternative modeled comparison set is defined yet for this pair.</p>`
    );
  });

  resetBtn.addEventListener("click", () => {
    startSelect.value = "";
    endSelect.value = "";
    paceSelect.value = "1.3";
    clearRouteLayers();
    grayEdgesLayer = L.geoJSON(edges, { style: hiddenEdgeStyle }).addTo(map);
    refreshDropdowns();
    updateResult("Select a start and end point to compare route options.");
  });

  updateQrCode();
}

refreshDropdowns();
startSelect.addEventListener("change", refreshDropdowns);
endSelect.addEventListener("change", refreshDropdowns);

loadLayers().catch((error) => {
  console.error(error);
  updateResult(
    `<div class="route-badge alert-badge">Data error</div>
     <p>Map data could not be loaded.</p>
     <p class="subtle alert-text">Check that the latest GeoJSON files are present in the data folder.</p>`
  );
});