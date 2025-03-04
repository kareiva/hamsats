<template>
  <div class="container">
    <div id="map" class="map-container">
      <div class="custom-controls top-right">
        <button @click="setHomeLocation" class="home-button">Set Home Location</button>
        <div class="slider-container" v-if="homeCoordinates">
          <label for="agl-slider">AGL: {{ aglHeight }}m</label>
          <div class="vertical-slider-wrapper">
            <input 
              type="range" 
              id="agl-slider" 
              v-model="aglHeight" 
              min="0" 
              max="500" 
              step="1"
              @input="calculateVisibleHorizon"
              class="vertical-slider"
            >
            <div class="slider-markers">
              <span class="marker top">500m</span>
              <span class="marker middle">250m</span>
              <span class="marker bottom">0m</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="status-bar">
      <div v-if="homeCoordinates">
        Home Location: {{ homeCoordinates.lat.toFixed(6) }}° N, {{ homeCoordinates.lon.toFixed(6) }}° E
        <span v-if="elevation !== null"> | Elevation ASL: {{ elevation.toFixed(1) }} m | Elevation AGL: {{ aglHeight }} m</span>
        <span v-else> | Fetching elevation...</span>
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
import Polygon from 'ol/geom/Polygon';
import Circle from 'ol/geom/Circle';
import { Style, Icon, Fill, Stroke } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import Translate from 'ol/interaction/Translate';
import { circular as createCircularPolygon } from 'ol/geom/Polygon';

const mapInstance = ref<Map | null>(null);
const homeFeature = ref<Feature | null>(null);
const vectorSource = ref<VectorSource | null>(null);
const horizonSource = ref<VectorSource | null>(null);
const homeCoordinates = ref<{ lat: number; lon: number } | null>(null);
const elevation = ref<number | null>(null);
const horizonFeature = ref<Feature | null>(null);
const aglHeight = ref<number>(0); // Default AGL height is 0 meters

// Watch for changes in home coordinates to fetch elevation
watch(homeCoordinates, async (newCoords) => {
  if (newCoords) {
    // Save to session storage
    sessionStorage.setItem('homeLocation', JSON.stringify(newCoords));
    
    // Reset elevation while fetching
    elevation.value = null;
    
    // Clear any existing horizon
    if (horizonSource.value && horizonFeature.value) {
      horizonSource.value.removeFeature(horizonFeature.value);
      horizonFeature.value = null;
    }
    
    // Fetch elevation data
    try {
      await fetchElevation(newCoords.lat, newCoords.lon);
      // Calculate horizon after elevation is fetched
      if (elevation.value !== null) {
        calculateVisibleHorizon();
      }
    } catch (error) {
      console.error('Failed to fetch elevation:', error);
    }
  }
}, { deep: true });

// Watch for changes in elevation to calculate horizon
watch(elevation, (newElevation) => {
  if (newElevation !== null && homeCoordinates.value) {
    calculateVisibleHorizon();
  }
}, { immediate: false });

// Calculate the distance to the horizon based on observer height
function calculateHorizonDistance(observerHeight: number): number {
  // Formula: distance (km) = 3.57 * sqrt(height in meters)
  // This is a simplified formula for Earth's curvature
  return 3.57 * Math.sqrt(observerHeight);
}

// Calculate and draw the visible horizon
function calculateVisibleHorizon() {
  if (!mapInstance.value || !homeCoordinates.value || !vectorSource.value || !horizonSource.value || elevation.value === null) {
    console.error('Cannot calculate horizon: missing required data');
    return;
  }
  
  // Clear any existing horizon
  if (horizonFeature.value) {
    horizonSource.value.removeFeature(horizonFeature.value);
    horizonFeature.value = null;
  }
  
  // Get the observer height (elevation + 1.7m for average human height + AGL height)
  const observerHeight = elevation.value + 1.7 + Number(aglHeight.value);
  
  // Calculate the horizon distance in kilometers
  const horizonDistanceKm = calculateHorizonDistance(observerHeight);
  
  // Convert to meters for OpenLayers
  const horizonDistanceM = horizonDistanceKm * 1000;
  
  console.log(`Calculated horizon distance: ${horizonDistanceKm.toFixed(2)} km based on observer height of ${observerHeight.toFixed(1)} m`);
  
  // Get the home location in map coordinates
  const homePoint = fromLonLat([homeCoordinates.value.lon, homeCoordinates.value.lat]);
  
  // Log the home point to verify it's correct
  console.log('Home point in map coordinates:', homePoint);
  
  try {
    // Create a circle geometry directly instead of using circular polygon
    const circleGeometry = new Circle(homePoint, horizonDistanceM);
    
    // Create a feature with the circle geometry
    horizonFeature.value = new Feature({
      geometry: circleGeometry
    });
    
    // Style the horizon with blue colors
    horizonFeature.value.setStyle(
      new Style({
        fill: new Fill({
          color: 'rgba(0, 70, 255, 0.33)' // Blue fill with 33% opacity
        }),
        zIndex: 100 // Ensure high z-index
      })
    );
    
    // Add the feature to the horizon source
    horizonSource.value.addFeature(horizonFeature.value);
    
    // Force clear the source and re-add the feature to ensure it's rendered
    const tempFeature = horizonFeature.value;
    horizonSource.value.clear();
    horizonSource.value.addFeature(tempFeature);
    
    // Ensure the map is rendered to show the new feature
    mapInstance.value.render();
    
    // Calculate appropriate zoom level based on horizon distance
    // For a circle of radius r (in km), a good zoom level is approximately 14 - log2(r)
    const zoomLevel = Math.max(2, Math.min(19, Math.floor(14 - Math.log2(horizonDistanceKm))));
    console.log('Setting zoom level to:', zoomLevel);
    
    // Get the current view
    const view = mapInstance.value.getView();
    
    // Animate the view to smoothly transition to the horizon circle
    view.animate({
      center: homePoint,
      zoom: zoomLevel,
      duration: 1500, // 1.5 seconds for smooth transition
      easing: function(t) {
        // Use an easing function for smoother animation
        // This is a simple ease-out function
        return 1 - Math.pow(1 - t, 3);
      }
    });
    
    // Log success
    console.log('Horizon feature added successfully with radius:', horizonDistanceM, 'meters, zoom:', zoomLevel);
  } catch (error) {
    console.error('Error creating horizon circle:', error);
  }
}

// Fetch elevation data from Open-Elevation API
async function fetchElevation(lat: number, lon: number) {
  try {
    // Check if we have cached elevation data
    const cachedElevationKey = `elevation_${lat.toFixed(6)}_${lon.toFixed(6)}`;
    const cachedElevation = sessionStorage.getItem(cachedElevationKey);
    
    if (cachedElevation) {
      elevation.value = Number(cachedElevation);
      console.log(`Using cached elevation at (${lat}, ${lon}): ${elevation.value}m`);
      return;
    }
    
    // Using Open-Elevation API
    const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
    const data = await response.json();
    
    if (data && data.results && data.results.length > 0) {
      elevation.value = data.results[0].elevation;
      // Save to session storage
      sessionStorage.setItem(cachedElevationKey, elevation.value.toString());
      console.log(`Elevation at (${lat}, ${lon}): ${elevation.value}m`);
    } else {
      console.error('Invalid elevation data response:', data);
      elevation.value = null;
    }
  } catch (error) {
    console.error('Error fetching elevation data:', error);
    elevation.value = null;
    
    // Fallback to alternative API if the first one fails
    try {
      const response = await fetch(`https://elevation-api.io/api/elevation?points=(${lat},${lon})`);
      const data = await response.json();
      
      if (data && data.elevations && data.elevations.length > 0) {
        elevation.value = data.elevations[0].elevation;
        // Save to session storage
        const cachedElevationKey = `elevation_${lat.toFixed(6)}_${lon.toFixed(6)}`;
        sessionStorage.setItem(cachedElevationKey, elevation.value.toString());
        console.log(`Elevation (fallback) at (${lat}, ${lon}): ${elevation.value}m`);
      }
    } catch (fallbackError) {
      console.error('Fallback elevation API also failed:', fallbackError);
    }
  }
}

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
      
      // Style the feature with a green marker icon
      homeFeature.value.setStyle(
        new Style({
          image: new Icon({
            anchor: [0.5, 1],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            scale: 0.5
          })
        })
      );
      
      // Add the feature to the source
      vectorSource.value.addFeature(homeFeature.value);
      
      // Center the map on the saved location
      mapInstance.value.getView().setCenter(point);
      
      console.log('Loaded saved home location:', coords);
      
      // Fetch elevation for the saved location
      fetchElevation(coords.lat, coords.lon);
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
  
  // Style the feature with a green marker icon
  homeFeature.value.setStyle(
    new Style({
      image: new Icon({
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
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
  
  // Create vector source and layer for the horizon
  horizonSource.value = new VectorSource();
  const horizonLayer = new VectorLayer({
    source: horizonSource.value,
    zIndex: 5, // Below the marker but above the base map
    properties: {
      name: 'horizonLayer' // Add a name for debugging
    },
    style: new Style({
      fill: new Fill({
        color: 'rgba(0, 70, 255, 0.33)' // Blue fill with 33% opacity
      })
    })
  });
  
  // Create the map with proper view settings
  mapInstance.value = new Map({
    target: 'map',
    layers: [
      new TileLayer({
        source: new OSM()
      }),
      horizonLayer, // Make sure horizon layer is added before marker layer
      vectorLayer
    ],
    view: new View({
      center: [0, 0],
      zoom: 2,
      projection: 'EPSG:3857' // Explicitly set the projection to Web Mercator
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
    display: flex;
    flex-direction: column;
    gap: 5px;
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
  
  .slider-container {
    margin-top: 10px;
    background-color: rgba(255, 255, 255, 0.7);
    padding: 8px;
    border-radius: 4px;
    
    label {
      display: block;
      margin-bottom: 5px;
      font-size: 14px;
      color: #333;
      text-align: center;
    }
    
    .vertical-slider-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 150px;
      position: relative;
      margin: 10px auto;
      width: 100%;
      
      .vertical-slider {
        width: 150px;
        margin: 0;
        transform: rotate(-90deg);
        transform-origin: center;
        position: absolute;
        left: calc(50% - 75px);
        
        /* Webkit browsers specific styling */
        &::-webkit-slider-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: rgba(0, 60, 136, 0.9);
          cursor: pointer;
          -webkit-appearance: none;
          margin-top: -6px;
        }
        
        &::-webkit-slider-runnable-track {
          height: 4px;
          background: #ddd;
          border-radius: 2px;
        }
        
        /* Firefox specific styling */
        &::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: rgba(0, 60, 136, 0.9);
          cursor: pointer;
        }
        
        &::-moz-range-track {
          height: 4px;
          background: #ddd;
          border-radius: 2px;
        }
      }
      
      .slider-markers {
        position: absolute;
        right: 10px;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font-size: 12px;
        color: #333;
        
        .marker {
          line-height: 1;
          
          &.top {
            margin-top: -6px;
          }
          
          &.middle {
            margin-top: 0;
          }
          
          &.bottom {
            margin-bottom: -6px;
          }
        }
      }
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

/* Ensure vector features are visible */
.ol-layer canvas {
  image-rendering: auto;
}

/* Make sure the vector layers are visible */
.ol-layer {
  position: absolute;
  width: 100%;
  height: 100%;
}
</style> 