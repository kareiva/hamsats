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
import Cookies from 'js-cookie';
import { createMapLayers, initializeMap } from './utils/mapSetup';
import { calculateSatelliteInfo } from './utils/calculations';
import { HomeLocationFeature, type HomeLocationCoordinates } from './features/HomeLocation';
import { SatelliteFeature, type SatelliteInfo } from './features/SatelliteFeature';
import { NearestSatellitesFeature } from './features/NearestSatellitesFeature';
import HomeLocationControl from './controls/HomeLocationControl.vue';
import SatelliteSelector from './controls/SatelliteSelector.vue';
import StatusBar from './StatusBar.vue';

// Add cookie utility functions at the top of the script
const COOKIE_EXPIRY = 30; // days
const SETTINGS_PREFIX = 'satgazer_';

function saveSetting(key: string, value: any) {
  Cookies.set(SETTINGS_PREFIX + key, JSON.stringify(value), { expires: COOKIE_EXPIRY });
}

function loadSetting<T>(key: string, defaultValue: T): T {
  const value = Cookies.get(SETTINGS_PREFIX + key);
  if (value === undefined) return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

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
const nearestSatellitesFeature = ref<NearestSatellitesFeature | null>(null);

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
    
    // Load saved satellite selection after satellites are loaded
    const savedSatellite = loadSetting<string>('selectedSatellite', '');
    if (savedSatellite) {
      const satellite = satelliteList.find(sat => sat.name === savedSatellite);
      if (satellite) {
        selectedSatellite.value = savedSatellite;
        console.log(`Loaded saved satellite selection: ${savedSatellite}`);
        
        // Initialize the satellite feature
        currentSatelliteFeature.value = new SatelliteFeature(
          satellite.name,
          satellite.tle,
          mapLayers.vectorSource,
          mapLayers.lineSource
        );
        
        currentSatelliteFeature.value.setShowPath(showPath.value);
        
        // Initial update and get satellite position
        if (homeCoordinates.value && elevation.value !== null) {
          const satInfo = currentSatelliteFeature.value.updatePosition(
            homeCoordinates.value,
            elevation.value + aglHeight.value
          );
          satelliteInfo.value = satInfo;

          // Get current satellite position and fit view
          const satPosition = currentSatelliteFeature.value.getCurrentPosition();
          const homePoint = fromLonLat([homeCoordinates.value.lon, homeCoordinates.value.lat]);
          const satPoint = fromLonLat([satPosition.lng, satPosition.lat]);

          if (mapInstance.value) {
            const view = mapInstance.value.getView();
            const minX = Math.min(homePoint[0], satPoint[0]);
            const minY = Math.min(homePoint[1], satPoint[1]);
            const maxX = Math.max(homePoint[0], satPoint[0]);
            const maxY = Math.max(homePoint[1], satPoint[1]);
            
            const padding = [(maxX - minX) * 0.2, (maxY - minY) * 0.2];
            const extent = [minX - padding[0], minY - padding[1], maxX + padding[0], maxY + padding[1]];
            
            view.fit(extent, {
              duration: 1000,
              padding: [50, 50, 50, 50]
            });
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
          
          currentSatelliteFeature.value.setUpdateInterval(updateInterval);
        }
        return;
      }
    }

    // If no valid saved selection or initialization failed, show nearest satellites
    if (!selectedSatellite.value && homeCoordinates.value && satellites.value.length > 0) {
      if (!nearestSatellitesFeature.value) {
        nearestSatellitesFeature.value = new NearestSatellitesFeature(mapLayers.vectorSource);
      }
      
      const nearestSats = satellites.value
        .filter(sat => sat.distance !== undefined)
        .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity))
        .slice(0, 5);

      nearestSatellitesFeature.value.updateSatellites(nearestSats);
      nearestSatellitesFeature.value.startTracking();

      // Calculate the extent to include home and all nearest satellites
      if (mapInstance.value && nearestSats.length > 0) {
        const homePoint = fromLonLat([homeCoordinates.value.lon, homeCoordinates.value.lat]);
        let minX = homePoint[0];
        let minY = homePoint[1];
        let maxX = homePoint[0];
        let maxY = homePoint[1];

        // Include all nearest satellites in the extent
        nearestSats.forEach(sat => {
          if (sat.position) {
            const satPoint = fromLonLat([sat.position.lng, sat.position.lat]);
            minX = Math.min(minX, satPoint[0]);
            minY = Math.min(minY, satPoint[1]);
            maxX = Math.max(maxX, satPoint[0]);
            maxY = Math.max(maxY, satPoint[1]);
          }
        });

        // Add padding to the extent
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = [width * 0.2, height * 0.2];
        const extent = [
          minX - padding[0],
          minY - padding[1],
          maxX + padding[0],
          maxY + padding[1]
        ];

        // Fit the view to include all points
        mapInstance.value.getView().fit(extent, {
          duration: 1000,
          padding: [50, 50, 50, 50]
        });
      }
    }
  } catch (error) {
    console.error('Error loading satellites:', error);
    satellites.value = [];
    selectedSatellite.value = '';
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

// Fetch elevation data from Open-Elevation API
async function fetchElevation(lat: number, lon: number) {
  try {
    const cachedElevationKey = `elevation_${lat.toFixed(6)}_${lon.toFixed(6)}`;
    const cachedElevation = loadSetting<number | null>(cachedElevationKey, null);
    
    if (cachedElevation) {
      elevation.value = cachedElevation;
      return;
    }
    
    const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
    const data = await response.json();
    
    if (data && data.results && data.results.length > 0) {
      elevation.value = data.results[0].elevation;
      if (elevation.value !== null) {
        saveSetting(cachedElevationKey, elevation.value);
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
        }
        
        saveSetting('homeLocation', coords);
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
  
  // Save to cookie and fetch elevation
  saveSetting('homeLocation', coords);
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
  
  saveSetting('homeLocation', newCoords);
  elevation.value = null;
  
  await fetchElevation(newCoords.lat, newCoords.lon);
  
  if (elevation.value !== null) {
    homeLocationFeature.updateHorizon(elevation.value + aglHeight.value);
  }
  
  // Update satellite distances and show nearest satellites if none selected
  if (satellites.value.length > 0) {
    updateSatelliteDistances(satellites.value);
    
    if (!selectedSatellite.value) {
      if (!nearestSatellitesFeature.value) {
        nearestSatellitesFeature.value = new NearestSatellitesFeature(mapLayers.vectorSource);
      }
      
      const nearestSats = satellites.value
        .filter(sat => sat.distance !== undefined)
        .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity))
        .slice(0, 5);

      nearestSatellitesFeature.value.updateSatellites(nearestSats);
      nearestSatellitesFeature.value.startTracking();

      // Calculate the extent to include home and all nearest satellites
      if (mapInstance.value && nearestSats.length > 0) {
        const homePoint = fromLonLat([newCoords.lon, newCoords.lat]);
        let minX = homePoint[0];
        let minY = homePoint[1];
        let maxX = homePoint[0];
        let maxY = homePoint[1];

        // Include all nearest satellites in the extent
        nearestSats.forEach(sat => {
          if (sat.position) {
            const satPoint = fromLonLat([sat.position.lng, sat.position.lat]);
            minX = Math.min(minX, satPoint[0]);
            minY = Math.min(minY, satPoint[1]);
            maxX = Math.max(maxX, satPoint[0]);
            maxY = Math.max(maxY, satPoint[1]);
          }
        });

        // Add padding to the extent
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = [width * 0.2, height * 0.2];
        const extent = [
          minX - padding[0],
          minY - padding[1],
          maxX + padding[0],
          maxY + padding[1]
        ];

        // Fit the view to include all points
        mapInstance.value.getView().fit(extent, {
          duration: 1000,
          padding: [50, 50, 50, 50]
        });
      }
    }
  }
}, { deep: true });

// Watch for changes in selectedSatellite
watch(selectedSatellite, (newSatellite) => {
  // Save selection state (including empty string for no selection)
  saveSetting('selectedSatellite', newSatellite);

  // First, clean up the old satellite and its features
  if (currentSatelliteFeature.value) {
    currentSatelliteFeature.value.stopTracking();
    currentSatelliteFeature.value.remove();
    currentSatelliteFeature.value = null;
  }

  // Stop tracking nearest satellites if we're selecting a specific satellite
  if (nearestSatellitesFeature.value && newSatellite) {
    nearestSatellitesFeature.value.stopTracking();
  }

  if (newSatellite) {
    const satellite = satellites.value.find(sat => sat.name === newSatellite);
    
    if (satellite) {
      // Create new satellite feature only after old one is completely removed
      currentSatelliteFeature.value = new SatelliteFeature(
        satellite.name,
        satellite.tle,
        mapLayers.vectorSource,
        mapLayers.lineSource
      );
      
      currentSatelliteFeature.value.setShowPath(showPath.value);
      
      // Initial update and get satellite position
      let satInfo = null;
      if (homeCoordinates.value && elevation.value !== null) {
        satInfo = currentSatelliteFeature.value.updatePosition(
          homeCoordinates.value,
          elevation.value + aglHeight.value
        );
        satelliteInfo.value = satInfo;

        // Get current satellite position and fit view
        const satPosition = currentSatelliteFeature.value.getCurrentPosition();
        const homePoint = fromLonLat([homeCoordinates.value.lon, homeCoordinates.value.lat]);
        const satPoint = fromLonLat([satPosition.lng, satPosition.lat]);

        if (mapInstance.value) {
          const view = mapInstance.value.getView();
          const minX = Math.min(homePoint[0], satPoint[0]);
          const minY = Math.min(homePoint[1], satPoint[1]);
          const maxX = Math.max(homePoint[0], satPoint[0]);
          const maxY = Math.max(homePoint[1], satPoint[1]);
          
          const padding = [(maxX - minX) * 0.2, (maxY - minY) * 0.2];
          const extent = [minX - padding[0], minY - padding[1], maxX + padding[0], maxY + padding[1]];
          
          view.fit(extent, {
            duration: 1000,
            padding: [50, 50, 50, 50]
          });
        }
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
      
      currentSatelliteFeature.value.setUpdateInterval(updateInterval);
    }
  } else {
    satelliteInfo.value = null;
    // When no satellite is selected, show the 5 nearest satellites
    if (homeCoordinates.value && satellites.value.length > 0) {
      if (!nearestSatellitesFeature.value) {
        nearestSatellitesFeature.value = new NearestSatellitesFeature(mapLayers.vectorSource);
      }
      
      // Get and sort satellites by distance
      const nearestSats = satellites.value
        .filter(sat => sat.distance !== undefined)
        .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity))
        .slice(0, 5);

      nearestSatellitesFeature.value.updateSatellites(nearestSats);
      nearestSatellitesFeature.value.startTracking();

      // Calculate the extent to include home and all nearest satellites
      if (mapInstance.value && nearestSats.length > 0) {
        const homePoint = fromLonLat([homeCoordinates.value.lon, homeCoordinates.value.lat]);
        let minX = homePoint[0];
        let minY = homePoint[1];
        let maxX = homePoint[0];
        let maxY = homePoint[1];

        // Include all nearest satellites in the extent
        nearestSats.forEach(sat => {
          if (sat.position) {
            const satPoint = fromLonLat([sat.position.lng, sat.position.lat]);
            minX = Math.min(minX, satPoint[0]);
            minY = Math.min(minY, satPoint[1]);
            maxX = Math.max(maxX, satPoint[0]);
            maxY = Math.max(maxY, satPoint[1]);
          }
        });

        // Add padding to the extent
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = [width * 0.2, height * 0.2];
        const extent = [
          minX - padding[0],
          minY - padding[1],
          maxX + padding[0],
          maxY + padding[1]
        ];

        // Fit the view to include all points
        mapInstance.value.getView().fit(extent, {
          duration: 1000,
          padding: [50, 50, 50, 50]
        });
      }
    }
  }
});

// Watch for changes in showPath
watch(showPath, (newValue) => {
  saveSetting('showPath', newValue);
  if (currentSatelliteFeature.value) {
    currentSatelliteFeature.value.setShowPath(newValue);
  }
});

// Initialize map on component mount
onMounted(() => {
  showPath.value = loadSetting('showPath', false);
  
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
  const savedLocation = loadSetting<HomeLocationCoordinates | null>('homeLocation', null);
  if (savedLocation) {
    try {
      homeCoordinates.value = savedLocation;
      homeLocationFeature.setLocation(savedLocation);
      fetchElevation(savedLocation.lat, savedLocation.lon);
      
      // Center the map on the saved location
      const point = fromLonLat([savedLocation.lon, savedLocation.lat]);
      mapInstance.value.getView().setCenter(point);
      mapInstance.value.getView().setZoom(9);
    } catch (e) {
      console.error('Failed to parse saved home location:', e);
      requestGeolocation();
    }
  } else {
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
  if (nearestSatellitesFeature.value) {
    nearestSatellitesFeature.value.stopTracking();
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