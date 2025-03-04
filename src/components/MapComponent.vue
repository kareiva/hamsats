<template>
  <div class="container">
    <div id="map" class="map-container">
      <div class="custom-controls top-right">
        <button @click="setHomeLocation" class="home-button">Set Home Location</button>
      </div>
    </div>
    <div class="status-bar">
      <div v-if="homeCoordinates">
        Home Location: {{ homeCoordinates.lat.toFixed(6) }}° N, {{ homeCoordinates.lon.toFixed(6) }}° E
      </div>
      <div v-else>No home location set</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { defaults as defaultControls } from 'ol/control';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Icon } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import Translate from 'ol/interaction/Translate';

const mapInstance = ref<Map | null>(null);
const homeFeature = ref<Feature | null>(null);
const vectorSource = ref<VectorSource | null>(null);
const homeCoordinates = ref<{ lat: number; lon: number } | null>(null);

// Save coordinates to session storage whenever they change
watch(homeCoordinates, (newCoords) => {
  if (newCoords) {
    sessionStorage.setItem('homeLocation', JSON.stringify(newCoords));
  }
}, { deep: true });

// Load saved home location from session storage
function loadSavedHomeLocation() {
  const savedLocation = sessionStorage.getItem('homeLocation');
  if (savedLocation && vectorSource.value && mapInstance.value) {
    try {
      const coords = JSON.parse(savedLocation);
      homeCoordinates.value = coords;
      
      // Create a point at the saved location
      const point = fromLonLat([coords.lon, coords.lat]);
      homeFeature.value = new Feature({
        geometry: new Point(point)
      });
      
      // Style the feature
      homeFeature.value.setStyle(
        new Style({
          image: new Icon({
            anchor: [0.5, 1],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            scale: 0.5
          })
        })
      );
      
      // Add the feature to the source
      vectorSource.value.addFeature(homeFeature.value);
      
      // Center the map on the saved location
      mapInstance.value.getView().setCenter(point);
      
      console.log('Loaded saved home location:', coords);
    } catch (e) {
      console.error('Failed to parse saved home location:', e);
    }
  }
}

function setHomeLocation() {
  if (!mapInstance.value || !vectorSource.value) return;
  
  // Clear any existing home location
  if (homeFeature.value) {
    vectorSource.value.removeFeature(homeFeature.value);
  }
  
  // Get the center of the current view
  const view = mapInstance.value.getView();
  const center = view.getCenter();
  
  if (!center) return;
  
  // Create a new feature at the center of the map
  homeFeature.value = new Feature({
    geometry: new Point(center)
  });
  
  // Style the feature with a marker icon
  homeFeature.value.setStyle(
    new Style({
      image: new Icon({
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        scale: 0.5
      })
    })
  );
  
  // Add the feature to the source
  vectorSource.value.addFeature(homeFeature.value);
  
  // Update coordinates
  const lonLat = toLonLat(center);
  homeCoordinates.value = { lon: lonLat[0], lat: lonLat[1] };
  console.log('Home location set at:', lonLat);
}

onMounted(() => {
  // Create vector source and layer for the home location marker
  vectorSource.value = new VectorSource();
  const vectorLayer = new VectorLayer({
    source: vectorSource.value,
    zIndex: 10 // Make sure it's above the base map
  });
  
  mapInstance.value = new Map({
    target: 'map',
    layers: [
      new TileLayer({
        source: new OSM()
      }),
      vectorLayer
    ],
    view: new View({
      center: [0, 0],
      zoom: 2
    }),
    controls: defaultControls()
  });
  
  // Add translate interaction to make the marker draggable
  const translate = new Translate({
    features: vectorSource.value.getFeaturesCollection()
  });
  
  mapInstance.value.addInteraction(translate);
  
  // Listen for translate end to update coordinates
  translate.on('translateend', (event) => {
    const feature = event.features.item(0);
    if (feature) {
      const geometry = feature.getGeometry();
      if (geometry && geometry instanceof Point) {
        const coordinates = geometry.getCoordinates();
        const lonLat = toLonLat(coordinates);
        homeCoordinates.value = { lon: lonLat[0], lat: lonLat[1] };
        console.log('Home location moved to:', lonLat);
      }
    }
  });
  
  // Load saved home location if available
  loadSavedHomeLocation();
});
</script>

<style lang="scss">
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
}

.map-container {
  flex: 1;
  position: relative;
}

.status-bar {
  height: 30px;
  background-color: #f0f0f0;
  border-top: 1px solid #ccc;
  padding: 5px 10px;
  font-family: monospace;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-controls {
  position: absolute;
  z-index: 1000;
  
  &.top-right {
    top: 10px;
    right: 10px;
  }
  
  .home-button {
    background-color: rgba(0, 60, 136, 0.7);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 14px;
    cursor: pointer;
    
    &:hover {
      background-color: rgba(0, 60, 136, 0.9);
    }
  }
}

/* Create a navigation bar at the bottom */
.ol-control {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  padding: 2px;
  z-index: 1000;
  
  button {
    background-color: rgba(0, 60, 136, 0.7);
    color: white;
    border: none;
    border-radius: 2px;
    font-size: 1.14em;
    font-weight: bold;
    height: 1.375em;
    line-height: 0.4em;
    margin: 1px;
    padding: 0.5em;
    text-align: center;
    width: 1.375em;
    
    &:hover {
      background-color: rgba(0, 60, 136, 0.9);
      cursor: pointer;
    }
  }
}

/* Position all controls at the bottom */
.ol-zoom, .ol-rotate {
  position: absolute !important;
  top: auto !important;
  bottom: 10px !important;
}

/* Zoom controls on the left */
.ol-zoom {
  left: 10px !important;
  
  .ol-zoom-in {
    border-radius: 4px 4px 0 0;
  }
  
  .ol-zoom-out {
    border-radius: 0 0 4px 4px;
  }
}

/* Rotate control on the right */
.ol-rotate {
  right: 10px !important;
  
  button {
    border-radius: 4px;
  }
}

/* Attribution above the controls */
.ol-attribution {
  position: absolute !important;
  bottom: 50px !important;
  right: 10px !important;
  
  &.ol-uncollapsible {
    bottom: 10px !important;
    right: 60px !important;
  }
  
  ul {
    font-size: 0.7rem;
    color: #333;
    text-shadow: 0 0 2px white;
  }
}

/* Ensure the OpenLayers viewport doesn't override our positioning */
.ol-viewport {
  position: absolute !important;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
</style> 