<template>
  <div class="container">
    <div id="map" class="map-container">
      <div class="custom-controls top-right">
        <HomeLocationControl
          :home-coordinates="homeCoordinates"
          :agl-height="aglHeight"
          @set-home="setHomeLocation"
          @update:agl-height="updateAglHeight"
        />
        <SatelliteSelector
          :home-coordinates="homeCoordinates"
          :satellites="satellites"
          v-model:selected-satellite="selectedSatellite"
          v-model:show-path="showPath"
        />
      </div>
    </div>
    <StatusBar
      :home-coordinates="homeCoordinates"
      :elevation="elevation"
      :agl-height="aglHeight"
      :selected-satellite="selectedSatellite"
      :satellite-info="satelliteInfo"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, onUnmounted } from 'vue';
import Map from 'ol/Map';
import { fromLonLat, toLonLat } from 'ol/proj';
import Translate from 'ol/interaction/Translate';
import { getLatLngObj, getSatelliteInfo } from 'tle.js';
import { createMapLayers, initializeMap } from './utils/mapSetup';
import { calculateSatelliteInfo, calculateHorizonDistance } from './utils/calculations';
import { HomeLocationFeature, type HomeLocationCoordinates } from './features/HomeLocation';
import { SatelliteFeature, type SatelliteInfo } from './features/SatelliteFeature';
import HomeLocationControl from './controls/HomeLocationControl.vue';
import SatelliteSelector from './controls/SatelliteSelector.vue';
import StatusBar from './StatusBar.vue';

// State
const mapInstance = ref<Map | null>(null);
const homeCoordinates = ref<HomeLocationCoordinates | null>(null);
const elevation = ref<number | null>(null);
const aglHeight = ref<number>(0);
const selectedSatellite = ref<string>('');
const satellites = ref<{ name: string; tle: [string, string]; position?: { lat: number; lng: number; height: number }; distance?: number }[]>([]);
const showPath = ref<boolean>(false);
const satelliteInfo = ref<SatelliteInfo | null>(null);
const currentSatelliteFeature = ref<SatelliteFeature | null>(null);

// Features and Layers
let homeLocationFeature: HomeLocationFeature;
let mapLayers: ReturnType<typeof createMapLayers>;

// Load satellites from file
async function loadSatellites() {
  try {
    const response = await fetch('https://celestrak.org/NORAD/elements/amateur.txt');
    if (!response.ok) {
      throw new Error(`Failed to load satellites: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    const lines = text.split('\n');
    const satelliteList: { name: string; tle: [string, string]; position?: { lat: number; lng: number; height: number }; distance?: number }[] = [];
    
    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 < lines.length) {
        const name = lines[i].trim();
        const line1 = lines[i + 1].trim();
        const line2 = lines[i + 2].trim();
        
        if (name && line1 && line2 && line1.startsWith('1 ') && line2.startsWith('2 ')) {
          try {
            const tle: [string, string] = [line1, line2];
            const now = Date.now();
            const position = getLatLngObj(tle, now);
            const satInfo = getSatelliteInfo(tle, now);
            
            satelliteList.push({
              name,
              tle,
              position: { ...position, height: satInfo.height }
            });
          } catch (e) {
            console.warn(`Failed to calculate position for satellite ${name}:`, e);
            satelliteList.push({ name, tle: [line1, line2] });
          }
        }
      }
    }
    
    if (homeCoordinates.value) {
      updateSatelliteDistances(satelliteList);
    }
    
    satellites.value = satelliteList;
    console.log(`Loaded ${satelliteList.length} satellites from file`);
    
    loadSavedSatelliteSelection();
  } catch (error) {
    console.error('Error loading satellites:', error);
    satellites.value = [
      { name: 'ISS (ZARYA)', tle: ['1 25544U 98067A   17206.18396726  .00001961  00000-0  36771-4 0  9993', '2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.54225995 67660'] },
      { name: 'NOAA-19', tle: ['1 33591U 09005A   23305.51689030  .00000076  00000+0  65128-4 0  9992', '2 33591  99.1949 150.2287 0013223 223.4876 136.5274 14.12501878 761962'] },
      { name: 'AMSAT-OSCAR 7', tle: ['1 07530U 74089B   23305.84246462 -.00000030  00000+0  10000-3 0  9996', '2 07530 101.4038 287.7831 0011925 349.4315  10.6549 12.53637849 26729'] }
    ];
    
    loadSavedSatelliteSelection();
  }
}

function updateSatelliteDistances(satelliteList: typeof satellites.value) {
  if (!homeCoordinates.value || !elevation.value) return;
  
  satelliteList.forEach(sat => {
    if (sat.position) {
      const info = calculateSatelliteInfo(
        homeCoordinates.value!.lat,
        homeCoordinates.value!.lon,
        elevation.value || 0,
        sat.position.lat,
        sat.position.lng,
        sat.position.height
      );
      sat.distance = info.distance;
    }
  });
  
  satelliteList.sort((a, b) => {
    if (a.distance === undefined && b.distance === undefined) return 0;
    if (a.distance === undefined) return 1;
    if (b.distance === undefined) return -1;
    return a.distance - b.distance;
  });
}

// Function to load saved satellite selection or set default
function loadSavedSatelliteSelection() {
  const savedSatellite = sessionStorage.getItem('selectedSatellite');
  
  if (savedSatellite) {
    const satelliteExists = satellites.value.some(sat => sat.name === savedSatellite);
    if (satelliteExists) {
      selectedSatellite.value = savedSatellite;
      console.log(`Loaded saved satellite selection: ${savedSatellite}`);
      return;
    }
  }
  
  setDefaultSatellite();
}

// Function to set default satellite to ISS
function setDefaultSatellite() {
  const issIndex = satellites.value.findIndex(sat => sat.name.includes('ISS'));
  
  if (issIndex >= 0) {
    selectedSatellite.value = satellites.value[issIndex].name;
  } else if (satellites.value.length > 0) {
    selectedSatellite.value = satellites.value[0].name;
  }
}

// Fetch elevation data from Open-Elevation API
async function fetchElevation(lat: number, lon: number) {
  try {
    const cachedElevationKey = `elevation_${lat.toFixed(6)}_${lon.toFixed(6)}`;
    const cachedElevation = sessionStorage.getItem(cachedElevationKey);
    
    if (cachedElevation) {
      elevation.value = Number(cachedElevation);
      return;
    }
    
    const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
    const data = await response.json();
    
    if (data && data.results && data.results.length > 0) {
      elevation.value = data.results[0].elevation;
      if (elevation.value !== null) {
        sessionStorage.setItem(cachedElevationKey, elevation.value.toString());
      }
    }
  } catch (error) {
    console.error('Error fetching elevation data:', error);
    elevation.value = null;
  }
}

function requestGeolocation() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
        homeCoordinates.value = coords;
        
        // Update the home location feature
        if (homeLocationFeature) {
          homeLocationFeature.setLocation(coords);
        }
        
        // Center the map on the location
        if (mapInstance.value) {
          const point = fromLonLat([coords.lon, coords.lat]);
          mapInstance.value.getView().setCenter(point);
          mapInstance.value.getView().setZoom(12);
        }
        
        sessionStorage.setItem('homeLocation', JSON.stringify(coords));
        fetchElevation(coords.lat, coords.lon);
      },
      (error) => {
        console.error('Error getting geolocation:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  }
}

function setHomeLocation() {
  if (!mapInstance.value) return;
  
  const view = mapInstance.value.getView();
  const center = view.getCenter();
  
  if (!center) return;
  
  const lonLat = toLonLat(center);
  const coords = { lon: lonLat[0], lat: lonLat[1] };
  homeCoordinates.value = coords;
  
  // Update the home location feature
  if (homeLocationFeature) {
    homeLocationFeature.setLocation(coords);
  }
  
  // Save to session storage and fetch elevation
  sessionStorage.setItem('homeLocation', JSON.stringify(coords));
  fetchElevation(coords.lat, coords.lon);
}

function updateAglHeight(height: number) {
  aglHeight.value = height;
  if (homeLocationFeature) {
    homeLocationFeature.updateHorizon(elevation.value! + height);
  }
}

// Watch for changes in home coordinates
watch(homeCoordinates, async (newCoords) => {
  if (!newCoords) return;
  
  sessionStorage.setItem('homeLocation', JSON.stringify(newCoords));
  elevation.value = null;
  
  await fetchElevation(newCoords.lat, newCoords.lon);
  
  if (elevation.value !== null) {
    homeLocationFeature.updateHorizon(elevation.value + aglHeight.value);
  }
  
  updateSatelliteDistances(satellites.value);
}, { deep: true });

// Watch for changes in selectedSatellite
watch(selectedSatellite, (newSatellite) => {
  if (newSatellite) {
    sessionStorage.setItem('selectedSatellite', newSatellite);
    const satellite = satellites.value.find(sat => sat.name === newSatellite);
    
    if (satellite) {
      if (currentSatelliteFeature.value) {
        currentSatelliteFeature.value.stopTracking();
      }
      
      currentSatelliteFeature.value = new SatelliteFeature(
        satellite.name,
        satellite.tle,
        mapLayers.vectorSource,
        mapLayers.lineSource
      );
      
      currentSatelliteFeature.value.setShowPath(showPath.value);
      
      // Initial update
      if (homeCoordinates.value && elevation.value !== null) {
        satelliteInfo.value = currentSatelliteFeature.value.updatePosition(
          homeCoordinates.value,
          elevation.value + aglHeight.value
        );
      }
      
      // Start tracking with periodic updates
      const updateInterval = window.setInterval(() => {
        if (homeCoordinates.value && elevation.value !== null) {
          satelliteInfo.value = currentSatelliteFeature.value?.updatePosition(
            homeCoordinates.value,
            elevation.value + aglHeight.value
          ) || null;
        }
      }, 1000);
      
      // Store the interval for cleanup
      currentSatelliteFeature.value.setUpdateInterval(updateInterval);
    }
  } else if (currentSatelliteFeature.value) {
    currentSatelliteFeature.value.stopTracking();
    currentSatelliteFeature.value = null;
    satelliteInfo.value = null;
  }
});

// Watch for changes in showPath
watch(showPath, (newValue) => {
  sessionStorage.setItem('showPath', newValue.toString());
  if (currentSatelliteFeature.value) {
    currentSatelliteFeature.value.setShowPath(newValue);
  }
});

// Initialize map on component mount
onMounted(() => {
  const savedPathState = sessionStorage.getItem('showPath');
  if (savedPathState !== null) {
    showPath.value = savedPathState === 'true';
  }
  
  mapLayers = createMapLayers();
  mapInstance.value = initializeMap('map', mapLayers);
  
  homeLocationFeature = new HomeLocationFeature(mapLayers.vectorSource, mapLayers.horizonSource);
  
  const translate = new Translate({
    filter: (feature) => {
      return feature === homeLocationFeature.getFeature();
    }
  });
  
  mapInstance.value.addInteraction(translate);
  
  translate.on('translateend', () => {
    const coordinates = homeLocationFeature.getCoordinates();
    if (coordinates) {
      homeCoordinates.value = coordinates;
    }
  });
  
  // First try to load saved location
  const savedLocation = sessionStorage.getItem('homeLocation');
  if (savedLocation) {
    try {
      const coords = JSON.parse(savedLocation);
      homeCoordinates.value = coords;
      homeLocationFeature.setLocation(coords);
      fetchElevation(coords.lat, coords.lon);
      
      // Center the map on the saved location with city-level zoom
      const point = fromLonLat([coords.lon, coords.lat]);
      mapInstance.value.getView().setCenter(point);
      mapInstance.value.getView().setZoom(12); // City-level zoom
      
      // Calculate appropriate zoom level based on horizon radius
      const horizonDistance = calculateHorizonDistance(aglHeight.value);
      const view = mapInstance.value.getView();
      const mapSize = mapInstance.value.getSize();
      if (mapSize) {
        const targetWidth = horizonDistance * 6; // Make horizon radius 1/6 of map width
        const resolution = targetWidth / mapSize[0];
        const zoom = view.getZoomForResolution(resolution);
        if (zoom) {
          view.setZoom(zoom);
        }
      }
    } catch (e) {
      console.error('Failed to parse saved home location:', e);
      requestGeolocation();
    }
  } else {
    // If no saved location, request geolocation
    requestGeolocation();
  }
  
  // Load satellites after map initialization
  loadSatellites();
});

// Clean up on component unmount
onUnmounted(() => {
  if (currentSatelliteFeature.value) {
    currentSatelliteFeature.value.stopTracking();
  }
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
}

/* OpenLayers control styles */
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

.ol-zoom, .ol-rotate {
  position: absolute !important;
  top: auto !important;
  bottom: 10px !important;
}

.ol-zoom {
  left: 10px !important;
  
  .ol-zoom-in {
    border-radius: 4px 4px 0 0;
  }
  
  .ol-zoom-out {
    border-radius: 0 0 4px 4px;
  }
}

.ol-rotate {
  right: 10px !important;
  
  button {
    border-radius: 4px;
  }
}

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
  
  button {
    display: none !important;
  }
  
  &.ol-collapsed ul {
    display: block !important;
  }
  
  &.ol-collapsed {
    padding: 0 !important;
    background: none !important;
  }
}

.ol-viewport {
  position: absolute !important;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.ol-layer canvas {
  image-rendering: auto;
}

.ol-layer {
  position: absolute;
  width: 100%;
  height: 100%;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.horizon-layer canvas {
  animation: fadeIn 1s ease-in-out;
}
</style> 