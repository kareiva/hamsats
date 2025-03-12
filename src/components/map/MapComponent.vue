<template>
  <div class="container">
    <div id="map" class="map-container">
      <div class="custom-controls top-right">
        <HomeLocationControl
          :home-coordinates="homeCoordinates"
          :agl-height="aglHeight"
          @toggle-home="toggleHomeLocation"
          @update:agl-height="updateAglHeight"
        />
        <SatelliteSelector
          :home-coordinates="homeCoordinates"
          :satellites="satellites"
          v-model:selected-satellite="selectedSatellite"
          v-model:show-path="showPath"
          v-model:baofeng-mode="baofengMode"
        />
        <TransmitterInfoControl
          v-if="selectedSatellite && selectedSatelliteCatalogNumber"
          :catalog-number="selectedSatelliteCatalogNumber"
        />
        <UpcomingSatellitesControl
          v-if="!selectedSatellite && homeCoordinates && upcomingVisibleSatellites.length > 0"
          :upcoming-satellites="upcomingVisibleSatellites"
          :baofeng-mode="baofengMode"
          @select-satellite="selectUpcomingSatellite"
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
import { onMounted, ref, watch, onUnmounted, computed } from 'vue';
import type { Map as OlMap } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Translate } from 'ol/interaction';
import { getLatLngObj, getSatelliteInfo } from 'tle.js';
import Cookies from 'js-cookie';
import { createMapLayers, initializeMap, type MapLayers } from './utils/mapSetup';
import { calculateSatelliteInfo } from './utils/calculations';
import { HomeLocationFeature, type HomeLocationCoordinates } from './features/HomeLocation';
import { SatelliteFeature, type SatelliteInfo } from './features/SatelliteFeature';
import { NearestSatellitesFeature } from './features/NearestSatellitesFeature';
import HomeLocationControl from './controls/HomeLocationControl.vue';
import SatelliteSelector from './controls/SatelliteSelector.vue';
import UpcomingSatellitesControl from './controls/UpcomingSatellitesControl.vue';
import TransmitterInfoControl from './controls/TransmitterInfoControl.vue';
import StatusBar from './StatusBar.vue';
import { loadSetting, saveSetting } from './utils/settings';

// Add this near the top of the script section, with other cookie utilities
const SATELLITE_DATA_COOKIE = 'satgazer_amateur_txt';
const SATELLITE_DATA_TIMESTAMP_COOKIE = 'satgazer_amateur_txt_timestamp';
const SATELLITE_DATA_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// State
let mapLayers: MapLayers;
const mapInstance = ref<OlMap>();
const homeCoordinates = ref<HomeLocationCoordinates | null>(null);
const elevation = ref<number | null>(null);
const aglHeight = ref<number>(0);
const selectedSatellite = ref<string>('');
const satellites = ref<{ name: string; tle: [string, string]; position?: { lat: number; lng: number; height: number }; distance?: number; catalogNumber?: string }[]>([]);
const showPath = ref<boolean>(false);
const baofengMode = ref<boolean>(false);
const satelliteInfo = ref<SatelliteInfo | null>(null);
const currentSatelliteFeature = ref<SatelliteFeature | null>(null);
const nearestSatellitesFeature = ref<NearestSatellitesFeature | null>(null);
const upcomingVisibleSatellites = ref<{ name: string; tle: [string, string]; visibleAt: Date }[]>([]);
let upcomingPredictionInterval: number | null = null;

// Features and Layers
let homeLocationFeature: HomeLocationFeature;

// Computed property to get the catalog number of the selected satellite
const selectedSatelliteCatalogNumber = computed(() => {
  if (!selectedSatellite.value) return undefined;
  const satellite = satellites.value.find(sat => sat.name === selectedSatellite.value);
  return satellite?.catalogNumber;
});

// Extract satellite catalog number from TLE line 1
function extractCatalogNumber(line1: string): string | undefined {
  // Catalog number is in positions 3-7 (0-indexed)
  const catalogNumber = line1.substring(2, 7).trim();
  return catalogNumber || undefined;
}

// Load satellites from file
async function loadSatellites() {
  let satelliteData: string | null = null;

  // Try to load from cookie first
  const cachedData = Cookies.get(SATELLITE_DATA_COOKIE);
  const cachedTimestamp = loadSetting<number>(SATELLITE_DATA_TIMESTAMP_COOKIE, 0);
  const now = Date.now();

  if (cachedData && cachedTimestamp && (now - cachedTimestamp < SATELLITE_DATA_EXPIRY)) {
    try {
      satelliteData = JSON.parse(cachedData);
      console.log('Using cached satellite data (age: ' + ((now - cachedTimestamp) / 3600000).toFixed(1) + ' hours)');
    } catch (e) {
      console.warn('Failed to parse cached satellite data:', e);
    }
  }

  // If no valid cached data, try to fetch from server
  if (!satelliteData) {
    try {
      const response = await fetch('https://celestrak.org/NORAD/elements/amateur.txt');
      if (response.ok) {
        satelliteData = await response.text();
        // Cache the new data with timestamp
        Cookies.set(SATELLITE_DATA_COOKIE, JSON.stringify(satelliteData));
        saveSetting(SATELLITE_DATA_TIMESTAMP_COOKIE, now);
        console.log('Fetched and cached new satellite data');
      } else if (response.status === 403) {
        console.warn('Access forbidden to Celestrak API');
      } else {
        console.warn(`Failed to fetch satellite data: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.warn('Error fetching satellite data:', error);
    }
  }

  // If both cache and fetch failed, use local file
  if (!satelliteData) {
    try {
      const response = await fetch('/amateur.txt');
      if (response.ok) {
        satelliteData = await response.text();
        console.log('Using local amateur.txt file');
      } else {
        throw new Error(`Failed to load local file: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to load satellite data from all sources:', error);
      satellites.value = [];
      selectedSatellite.value = '';
      return;
    }
  }

  // Parse the satellite data
  try {
    const lines = satelliteData.split('\n');
    const satelliteList: { name: string; tle: [string, string]; position?: { lat: number; lng: number; height: number }; distance?: number; catalogNumber?: string }[] = [];
    
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
            const catalogNumber = extractCatalogNumber(line1);
            
            satelliteList.push({
              name,
              tle,
              position: { ...position, height: satInfo.height },
              catalogNumber
            });
          } catch (e) {
            console.warn(`Failed to calculate position for satellite ${name}:`, e);
            const catalogNumber = extractCatalogNumber(line1);
            satelliteList.push({ name, tle: [line1, line2], catalogNumber });
          }
        }
      }
    }
    
    if (homeCoordinates.value) {
      updateSatelliteDistances(satelliteList);
    }
    
    satellites.value = satelliteList;
    console.log(`Loaded ${satelliteList.length} satellites`);
    
    // Check URL parameters for satellite selection
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');
    
    if (idParam) {
      // Find satellite by catalog number
      const satellite = satelliteList.find(sat => sat.catalogNumber === idParam);
      if (satellite) {
        selectedSatellite.value = satellite.name;
        console.log(`Selected satellite from URL parameter: ${satellite.name} (ID: ${idParam})`);
      } else {
        console.warn(`Satellite with ID ${idParam} not found`);
      }
    }
    
    // If no satellite selected from URL, try to load saved selection
    if (!selectedSatellite.value) {
      const savedSatellite = loadSetting<string>('selectedSatellite', '');
      if (savedSatellite) {
        const satellite = satelliteList.find(sat => sat.name === savedSatellite);
        if (satellite) {
          selectedSatellite.value = savedSatellite;
          console.log(`Loaded saved satellite selection: ${savedSatellite}`);
        }
      }
    }
    
    // Initialize satellite feature if a satellite is selected
    if (selectedSatellite.value) {
      const satellite = satelliteList.find(sat => sat.name === selectedSatellite.value);
      
      if (satellite) {
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
      
      // Predict upcoming visible satellites
      upcomingVisibleSatellites.value = predictUpcomingVisibleSatellites();
      console.log(`Predicted ${upcomingVisibleSatellites.value.length} upcoming visible satellites`);

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
    console.error('Error parsing satellite data:', error);
    satellites.value = [];
    selectedSatellite.value = '';
  }
}

async function updateSatelliteDistances(satelliteList: typeof satellites.value) {
  if (!homeCoordinates.value) return;

  const home = homeCoordinates.value;

  for (const satellite of satelliteList) {
    try {
      if (satellite.position) {
        const info = calculateSatelliteInfo(
          home.lat,
          home.lon,
          aglHeight.value,
          satellite.position.lat,
          satellite.position.lng,
          satellite.position.height
        );
        satellite.distance = info.distance;
      }
    } catch (e) {
      console.warn(`Failed to calculate distance for satellite ${satellite.name}:`, e);
    }
  }

  // Sort by distance
  satelliteList.sort((a, b) => {
    if (a.distance === undefined) return 1;
    if (b.distance === undefined) return -1;
    return a.distance - b.distance;
  });

  // Update nearest satellites feature
  if (nearestSatellitesFeature.value) {
    let nearestSats = satelliteList.slice(0, baofengMode.value ? 50 : 5); // Get more satellites if in Baofeng mode to filter

    if (baofengMode.value) {
      // Filter for FM satellites
      const fmSats = await Promise.all(
        nearestSats.map(async sat => {
          if (!sat.catalogNumber) return null;
          try {
            const response = await fetch(`/transponders/${sat.catalogNumber}.json`);
            if (!response.ok) return null;
            
            const transmitters = await response.json();
            const hasFM = transmitters.some((tx: any) => 
              tx.alive && (
                (tx.mode && tx.mode.includes('FM')) || 
                (tx.uplink_mode && tx.uplink_mode.includes('FM'))
              )
            );
            
            return hasFM ? sat : null;
          } catch (error) {
            console.error('Error checking FM mode:', error);
            return null;
          }
        })
      );

      nearestSats = fmSats.filter((sat): sat is NonNullable<typeof sat> => sat !== null).slice(0, 5);
    }

    nearestSatellitesFeature.value.updateSatellites(nearestSats);
  }
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

function toggleHomeLocation() {
  if (homeCoordinates.value) {
    // Clear home location
    homeCoordinates.value = null;
    elevation.value = null;
    aglHeight.value = 0;
    
    // Clear home location feature
    if (homeLocationFeature) {
      homeLocationFeature.clearLocation();
    }
    
    // Clear cookie
    Cookies.remove(SATELLITE_DATA_COOKIE);
    Cookies.remove(SATELLITE_DATA_TIMESTAMP_COOKIE);
    
    // Clear satellite selection and distances
    selectedSatellite.value = '';
    satellites.value.forEach(sat => {
      sat.distance = undefined;
    });
    
    // Reset map view
    if (mapInstance.value) {
      mapInstance.value.getView().setZoom(3);
      mapInstance.value.getView().setCenter(fromLonLat([0, 0]));
    }
  } else {
    // Set home location
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
}

function updateAglHeight(height: number) {
  aglHeight.value = height;
  if (homeLocationFeature) {
    homeLocationFeature.updateHorizon(elevation.value! + height);
  }
}

// Predict the next satellites that will become visible in the next 24 hours
function predictUpcomingVisibleSatellites() {
  if (!homeCoordinates.value || elevation.value === null || !satellites.value.length) {
    return [];
  }

  const observerOptions = {
    latitude: homeCoordinates.value.lat,
    longitude: homeCoordinates.value.lon,
    elevation: elevation.value + aglHeight.value,
    minElevation: 0 // Visible above horizon
  };

  const now = new Date();
  const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
  const predictions: { name: string; tle: [string, string]; visibleAt: Date }[] = [];
  
  // Get currently visible satellites to exclude them
  const currentlyVisible = satellites.value.filter(sat => {
    if (!sat.position) return false;
    
    const info = calculateSatelliteInfo(
      homeCoordinates.value!.lat,
      homeCoordinates.value!.lon,
      elevation.value! + aglHeight.value,
      sat.position.lat,
      sat.position.lng,
      sat.position.height
    );
    
    return info.elevationAngle > 0;
  }).map(sat => sat.name);
  
  console.log(`Currently visible satellites: ${currentlyVisible.length}`);
  
  // Check each satellite for upcoming visibility
  // We'll check more satellites to find the ones that will be visible soonest
  const maxSatellitesToCheck = 100; // Increase from 50 to 100 for better coverage
  let checkedCount = 0;
  
  for (const satellite of satellites.value) {
    // Skip if already visible
    if (currentlyVisible.includes(satellite.name)) {
      continue;
    }
    
    try {
      // Check visibility at multiple time points to find the next pass
      const nextVisibleTime = findNextVisibilityWindow(
        satellite.tle,
        now,
        endTime,
        observerOptions
      );
      
      if (nextVisibleTime) {
        predictions.push({
          name: satellite.name,
          tle: satellite.tle,
          visibleAt: nextVisibleTime
        });
      }
    } catch (e) {
      console.warn(`Failed to predict visibility for satellite ${satellite.name}:`, e);
    }
    
    // Limit how many satellites we check to avoid performance issues
    checkedCount++;
    if (checkedCount >= maxSatellitesToCheck) {
      break;
    }
  }
  
  // Sort by visibility time
  predictions.sort((a, b) => a.visibleAt.getTime() - b.visibleAt.getTime());
  
  // Take only the first 5 (soonest to become visible)
  return predictions.slice(0, 5);
}

// Find the next time a satellite becomes visible by checking multiple time points
function findNextVisibilityWindow(
  tle: [string, string],
  startTime: Date,
  endTime: Date,
  observerOptions: { latitude: number; longitude: number; elevation: number; minElevation: number }
): Date | null {
  // Check if satellite is already visible at start time
  const startVisible = isSatelliteVisibleAt(tle, startTime, observerOptions);
  if (startVisible) {
    return startTime;
  }
  
  // Sample multiple time points to find visibility windows
  const timeRange = endTime.getTime() - startTime.getTime();
  const numSamples = 144; // Check every 10 minutes for 24 hours
  const sampleInterval = timeRange / numSamples;
  
  let lastVisibility = false;
  
  // First pass: find approximate visibility windows
  for (let i = 0; i < numSamples; i++) {
    const sampleTime = new Date(startTime.getTime() + i * sampleInterval);
    const isVisible = isSatelliteVisibleAt(tle, sampleTime, observerOptions);
    
    // If we detect a transition from not visible to visible, we found a rising edge
    if (!lastVisibility && isVisible) {
      // Now use binary search to find the exact time
      return findVisibilityTimeExact(
        tle,
        new Date(sampleTime.getTime() - sampleInterval), // Previous sample
        sampleTime,
        observerOptions
      );
    }
    
    lastVisibility = isVisible;
  }
  
  return null; // No visibility window found
}

// Binary search to find the exact time when a satellite becomes visible
function findVisibilityTimeExact(
  tle: [string, string],
  startTime: Date,
  endTime: Date,
  observerOptions: { latitude: number; longitude: number; elevation: number; minElevation: number }
): Date | null {
  // Binary search to find the time when satellite becomes visible
  let low = startTime.getTime();
  let high = endTime.getTime();
  
  // Stop when we're within 1 minute of precision
  while (high - low > 60 * 1000) {
    const mid = Math.floor((low + high) / 2);
    const midTime = new Date(mid);
    
    if (isSatelliteVisibleAt(tle, midTime, observerOptions)) {
      high = mid; // If visible at mid, look for earlier time
    } else {
      low = mid; // If not visible at mid, look for later time
    }
  }
  
  // At this point, 'low' is the last time it was not visible
  // and 'high' is the first time it was visible (within 1 min precision)
  return new Date(high);
}

// Helper function to check if a satellite is visible at a specific time
function isSatelliteVisibleAt(
  tle: [string, string],
  time: Date,
  observerOptions: { latitude: number; longitude: number; elevation: number; minElevation: number }
): boolean {
  try {
    const satPosition = getLatLngObj(tle, time.getTime());
    const satInfo = getSatelliteInfo(tle, time.getTime());
    
    const info = calculateSatelliteInfo(
      observerOptions.latitude,
      observerOptions.longitude,
      observerOptions.elevation,
      satPosition.lat,
      satPosition.lng,
      satInfo.height
    );
    
    return info.elevationAngle > observerOptions.minElevation;
  } catch (e) {
    return false;
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
      
      // Predict upcoming visible satellites
      upcomingVisibleSatellites.value = predictUpcomingVisibleSatellites();
      console.log(`Predicted ${upcomingVisibleSatellites.value.length} upcoming visible satellites`);

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
  // Update page title
  document.title = newSatellite ? `Tracking ${newSatellite}` : 'HamSats by LY2EN';

  // Save selection state (including empty string for no selection)
  saveSetting('selectedSatellite', newSatellite);

  // Update URL with satellite ID if selected
  if (newSatellite) {
    const satellite = satellites.value.find(sat => sat.name === newSatellite);
    if (satellite && satellite.catalogNumber) {
      // Update URL without reloading the page
      const url = new URL(window.location.href);
      url.searchParams.set('id', satellite.catalogNumber);
      window.history.replaceState({}, '', url.toString());
    }
  } else {
    // Remove id parameter from URL when no satellite is selected
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.replaceState({}, '', url.toString());
  }

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
      
      // Predict upcoming visible satellites
      upcomingVisibleSatellites.value = predictUpcomingVisibleSatellites();
      console.log(`Predicted ${upcomingVisibleSatellites.value.length} upcoming visible satellites`);

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

// Watch for baofengMode changes to update nearest satellites
watch(baofengMode, () => {
  updateSatelliteDistances(satellites.value);
});

// Function to handle selection of an upcoming satellite
function selectUpcomingSatellite(name: string) {
  selectedSatellite.value = name;
}

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

  // Initialize nearest satellites feature with click handler
  nearestSatellitesFeature.value = new NearestSatellitesFeature(mapLayers.vectorSource);
  nearestSatellitesFeature.value.setMap(mapInstance.value);
  nearestSatellitesFeature.value.setClickHandler((name: string) => {
    selectedSatellite.value = name;
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
  
  // Set up periodic updates for upcoming satellite predictions
  upcomingPredictionInterval = window.setInterval(() => {
    if (!selectedSatellite.value && homeCoordinates.value && satellites.value.length > 0) {
      upcomingVisibleSatellites.value = predictUpcomingVisibleSatellites();
    }
  }, 60000); // Update every minute
});

// Clean up on component unmount
onUnmounted(() => {
  if (currentSatelliteFeature.value) {
    currentSatelliteFeature.value.stopTracking();
  }
  if (nearestSatellitesFeature.value) {
    nearestSatellitesFeature.value.stopTracking();
  }
  if (upcomingPredictionInterval !== null) {
    window.clearInterval(upcomingPredictionInterval);
  }
});
</script>

<style lang="scss">
.container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 32px);
  width: 100%;
  position: relative;
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
    max-width: calc(100% - 20px);
  }
}

@media (max-width: 640px) {
  .custom-controls {
    &.top-right {
      width: calc(100% - 20px);
    }
  }

  .ol-zoom {
    left: 10px !important;
    bottom: 60px !important;
  }

  .ol-rotate {
    right: 10px !important;
    bottom: 60px !important;
  }

  .ol-attribution {
    bottom: 10px !important;
    left: 0 !important;
    right: 0 !important;
    text-align: center;
    background-color: rgba(255, 255, 255, 0.7) !important;
    
    &.ol-uncollapsible {
      right: 0 !important;
    }
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