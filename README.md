# jsu-walkability-webgis_project

A micro-scale Web GIS project for pedestrian route decision mapping between Martin Hall, Houston Cole Library, and nearby parking access points at Jacksonville State University.

## Project Overview

This project combines ArcGIS Pro, Leaflet, OpenStreetMap, and custom GeoJSON layers to model and visualize pedestrian route choices in a focused campus corridor. It supports start-end selection, walking pace adjustment, estimated travel time, estimated arrival time, and route highlighting for the quickest path within the modeled network.

The project was developed as an MS-level course project to demonstrate how GIS and Web GIS can be combined for route-based campus decision support.

## Main Features

- Interactive campus web map using Leaflet
- OpenStreetMap basemap
- Custom pedestrian network built from ArcGIS Pro
- Start and end point selection
- Walking pace options:
  - Easy pace
  - Normal pace
  - Fast pace
- Estimated walking time
- Estimated arrival time based on device time
- Quickest path highlighting
- Alternative modeled route support for selected origin-destination pairs
- Responsive interface for desktop and mobile
- QR code for opening the map on another device

## Study Area

The study area focuses on the pedestrian environment around:

- Martin Hall
- Houston Cole Library
- nearby parking access points
- connecting walkway nodes and route connectors

This project does not aim to model the entire campus. Instead, it presents a micro-scale pedestrian routing prototype that can be expanded later.

## Methodology

1. Buildings, parking areas, nodes, and walkway edges were digitized in ArcGIS Pro.
2. Key entrances, parking access points, and route connectors were represented as nodes.
3. Walkable connections were represented as edges with geometry-based length values.
4. Exported layers were converted to GeoJSON.
5. Leaflet was used to visualize the network and calculate the shortest connected route in the current modeled network.
6. For selected node pairs, modeled alternative routes were also compared.

## Project Stack

- ArcGIS Pro — 40%
- Leaflet — 25%
- OpenStreetMap — 15%
- HTML — 10%
- CSS — 5%
- JavaScript — 5%

## Folder Structure

```text
jsu-walkability-webgis/
│
├── index.html
├── style.css
├── script.js
├── README.md
│
├── assets/
│   └── logo.png
│
└── data/
    ├── buildings.geojson
    ├── parking.geojson
    ├── nodes.geojson
    └── edges.geojson
