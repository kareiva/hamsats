<template>
  <div class="container">
    <div id="map" class="map-container">
      <div class="custom-controls top-right" ref="controlsEl">
        <HomeLocationControl
          :home-coordinates="homeCoordinates"
          :agl-height="aglHeight"
          :elevation="elevation"
          :geo-error="geoError"
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
          v-if="!selectedSatellite && homeCoordinates && skySatellites.length > 0"
          :sky-satellites="skySatellites"
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
      :pass-event-type="nextPassEvent?.type ?? null"
      :pass-event-remaining-seconds="passEventRemainingSeconds"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, onUnmounted, computed, nextTick } from 'vue';
import type { Map as OlMap } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Translate } from 'ol/interaction';
import { getSatelliteInfo, getLatLngObj, extractCatalogNumber } from '@/components/map/utils/satellite';
import { createMapLayers, initializeMap, type MapLayers } from './utils/mapSetup';
import { calculateSatelliteInfo } from './utils/calculations';
import { HomeLocationFeature, type HomeLocationCoordinates } from './features/HomeLocation';
import { SatelliteFeature, type SatelliteInfo } from './features/SatelliteFeature';
import { SkySatellitesFeature } from './features/SkySatellitesFeature';
import HomeLocationControl from './controls/HomeLocationControl.vue';
import SatelliteSelector from './controls/SatelliteSelector.vue';
import UpcomingSatellitesControl from './controls/UpcomingSatellitesControl.vue';
import TransmitterInfoControl from './controls/TransmitterInfoControl.vue';
import StatusBar from './StatusBar.vue';
import { loadSetting, saveSetting, removeSetting } from './utils/settings';

const SATELLITE_DATA_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// State
let mapLayers: MapLayers;
const mapInstance = ref<OlMap>();
const homeCoordinates = ref<HomeLocationCoordinates & { elevation?: number } | null>(null);
const elevation = ref<number | null>(null);
const aglHeight = ref<number>(0);
const selectedSatellite = ref<SatelliteWithName | null>(null);
const satellites = ref<{ name: string; tle: [string, string]; position?: { lat: number; lng: number; height: number }; distance?: number; catalogNumber?: string }[]>([]);
const showPath = ref<boolean>(false);
const baofengMode = ref<boolean>(loadSetting('baofengMode', false));
const satelliteInfo = ref<SatelliteInfo | null>(null);
const nextPassEvent = ref<{ type: 'AOS' | 'EOS'; time: Date } | null>(null);
const passEventRemainingSeconds = ref<number | null>(null);
const currentSatelliteFeature = ref<SatelliteFeature | null>(null);
const skySatellitesFeature = ref<SkySatellitesFeature | null>(null);
const skySatellites = ref<SkySatellite[]>([]);
const fmSatellitesLookup = ref<Record<string, boolean>>({});
const geoError = ref<string | null>(null);
let upcomingPredictionInterval: number | null = null;

const controlsEl = ref<HTMLElement | null>(null);

// Features and Layers
let homeLocationFeature: HomeLocationFeature;

// Computed property to get the catalog number of the selected satellite
const selectedSatelliteCatalogNumber = computed(() => {
  if (!selectedSatellite.value?.name) return undefined;
  const satellite = satellites.value.find(sat => sat.name === selectedSatellite.value!.name);
  return satellite?.catalogNumber;
});

async function fitViewForSatellite(sat: { lat: number; lng: number }) {
  if (!mapInstance.value) return;
  const satPoint = fromLonLat([sat.lng, sat.lat]);
  const view = mapInstance.value.getView();
  const zoom = 4;
  if (window.innerWidth <= 640) {
    await nextTick();
    const topPad = (controlsEl.value?.offsetHeight ?? 280) + 20;
    const resolution = view.getResolutionForZoom(zoom);
    view.animate({ center: [satPoint[0], satPoint[1] + (topPad / 2) * resolution], zoom, duration: 1000 });
  } else {
    view.animate({ center: satPoint, zoom, duration: 1000 });
  }
}

// Load satellites from file
async function loadSatellites() {
  let satelliteData: string | null = null;

  const cachedData = loadSetting<string | null>('amateur_txt', null);
  const cachedTimestamp = loadSetting<number>('amateur_txt_timestamp', 0);
  const now = Date.now();

  if (cachedData && cachedTimestamp && (now - cachedTimestamp < SATELLITE_DATA_EXPIRY)) {
    satelliteData = cachedData;
    console.log('Using cached satellite data (age: ' + ((now - cachedTimestamp) / 3600000).toFixed(1) + ' hours)');
  }

  // If no valid cached data, try to fetch from server
  if (!satelliteData) {
    try {
      const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle');
      if (response.ok) {
        satelliteData = await response.text();
        saveSetting('amateur_txt', satelliteData);
        saveSetting('amateur_txt_timestamp', now);
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
      selectedSatellite.value = null;
      return;
    }
  }

  // Parse the satellite data
  try {
    const lines = satelliteData.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const satelliteList: { name: string; tle: [string, string]; position?: { lat: number; lng: number; height: number }; distance?: number; catalogNumber?: string }[] = [];

    for (let i = 0; i < lines.length - 2; i++) {
      const line1 = lines[i + 1];
      const line2 = lines[i + 2];
      if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
        const name = lines[i];
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
        i += 2;
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
        selectedSatellite.value = { name: satellite.name, tle: satellite.tle };
        console.log(`Selected satellite from URL parameter: ${satellite.name} (ID: ${idParam})`);
      } else {
        console.warn(`Satellite with ID ${idParam} not found`);
      }
    }
    
    // If no satellite selected from URL, try to load saved selection
    if (!selectedSatellite.value) {
      const savedSatellite = loadSetting<SatelliteWithName | null>('selectedSatellite', null);
      if (savedSatellite) {
        const satellite = satelliteList.find(sat => sat.name === savedSatellite.name);
        if (satellite) {
          selectedSatellite.value = savedSatellite;
          console.log(`Loaded saved satellite selection: ${savedSatellite.name}`);
        }
      }
    }
    
    // Initialize satellite feature if a satellite is selected
    if (selectedSatellite.value?.name) {
      const satellite = satelliteList.find(sat => sat.name === selectedSatellite.value?.name);
      
      if (satellite) {
        // Initialize the satellite feature
        currentSatelliteFeature.value = new SatelliteFeature(
          satellite.name,
          satellite.tle,
          mapLayers.vectorSource,
          mapLayers.lineSource
        );
        
        currentSatelliteFeature.value.setShowPath(showPath.value);

        // Draw coverage circle immediately — elevation not required for this
        const satPosition = currentSatelliteFeature.value.getCurrentPosition();
        if (homeCoordinates.value && elevation.value !== null) {
          satelliteInfo.value = currentSatelliteFeature.value.updatePosition(
            homeCoordinates.value,
            elevation.value + aglHeight.value
          );
        } else {
          currentSatelliteFeature.value.updatePosition();
        }

        // Wait for OL to paint the circle (two rAF cycles) before starting the zoom animation
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await fitViewForSatellite(satPosition);

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
        return;
      }
    }

    // If no valid saved selection or initialization failed, show satellites in the sky
    if (!selectedSatellite.value && homeCoordinates.value && satellites.value.length > 0) {
      await refreshSkyState(true);
    }
  } catch (error) {
    console.error('Error parsing satellite data:', error);
    satellites.value = [];
    selectedSatellite.value = null;
  }
}

// Computes distance for every satellite and sorts satellites.value by it — used by the
// search dropdown (empty search shows nearest satellites first). Map marker selection
// is handled separately by refreshSkyState(), based on visibility rather than distance.
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
}

// Fetch elevation data from Open-Elevation API
async function fetchElevation(lat: number, lon: number) {
  try {
    const cacheKey = `${lat.toFixed(6)}_${lon.toFixed(6)}`;
    const cache = loadSetting<Record<string, number>>('elevation_cache', {});

    if (cache[cacheKey] !== undefined) {
      elevation.value = cache[cacheKey];
      return;
    }

    const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
    const data = await response.json();

    if (data && data.results && data.results.length > 0) {
      elevation.value = data.results[0].elevation;
      if (elevation.value !== null) {
        cache[cacheKey] = elevation.value;
        const keys = Object.keys(cache);
        if (keys.length > 10) {
          delete cache[keys[0]];
        }
        saveSetting('elevation_cache', cache);
      }
    }
  } catch (error) {
    console.error('Error fetching elevation data:', error);
    elevation.value = null;
  }
}

function clearHomeLocation() {
  // Clear home location
  homeCoordinates.value = null;
  elevation.value = null;
  aglHeight.value = 0;
  
  // Clear home location feature
  if (homeLocationFeature) {
    homeLocationFeature.clearLocation();
  }
  
  removeSetting('amateur_txt');
  removeSetting('amateur_txt_timestamp');
  
  // Clear satellite selection and distances
  selectedSatellite.value = null;
  satellites.value.forEach(sat => {
    sat.distance = undefined;
  });
  
  // Reset map view
  if (mapInstance.value) {
    mapInstance.value.getView().setZoom(3);
    mapInstance.value.getView().setCenter(fromLonLat([0, 0]));
  }
}

function requestGeolocation() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        geoError.value = null;
        const coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
        homeCoordinates.value = coords;

        if (homeLocationFeature) {
          homeLocationFeature.setLocation(coords);
        }

        if (mapInstance.value) {
          const point = fromLonLat([coords.lon, coords.lat]);
          mapInstance.value.getView().setCenter(point);
          mapInstance.value.getView().setZoom(8);
        }

        saveSetting('homeLocation', coords);
        fetchElevation(coords.lat, coords.lon);
      },
      (error) => {
        console.error('Error getting geolocation:', error);
        geoError.value = 'Location access denied — tap the map to set your position.';
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  } else {
    setHomeLocationFromMap(); // Fallback if geolocation is not supported
  }
}

function setHomeLocationFromMap() {
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

function toggleHomeLocation() {
  if (homeCoordinates.value) {
    clearHomeLocation();
  } else {
    requestGeolocation();
  }
}

function updateAglHeight(height: number) {
  aglHeight.value = height;
  if (homeLocationFeature) {
    homeLocationFeature.updateHorizon(height);
  }
  // Observer horizon changed — force the AOS/EOS countdown to recompute
  nextPassEvent.value = null;
}

// Watch for baofengMode changes
watch(baofengMode, async (newValue) => {
  // Called explicitly (not left to the selectedSatellite watcher) because
  // selectedSatellite is already null in the common case — the sky panel/map markers
  // are only shown when nothing is selected — so this assignment wouldn't trigger that
  // watcher's own refresh.
  selectedSatellite.value = null;
  saveSetting('baofengMode', newValue);
  updateSatelliteDistances(satellites.value);
  await refreshSkyState(true);
});

interface SkySatellite {
  name: string;
  tle: [string, string];
  eventTime: Date;
  eventType: 'AOS' | 'EOS';
  catalogNumber?: string;
  hasFM?: boolean;
}

interface SatelliteWithName {
  name: string;
  tle: [string, string];
}

// Load FM satellites lookup data
async function loadFmSatellitesLookup() {
  try {
    const response = await fetch('/fm-satellites.json');
    if (response.ok) {
      fmSatellitesLookup.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to load FM satellites lookup:', error);
  }
}

// Scans all satellites once for the shared underlying data behind both the "Satellites
// in your sky" panel and the map markers: satellites currently above the horizon (with
// their EOS), and satellites not yet visible (with their AOS). Both groups are sorted
// ascending by their own event time (soonest EOS/AOS first). AOS search is capped once
// enough upcoming candidates are found, since scanning every non-visible satellite to a
// 24h horizon is expensive; currently-visible satellites are always included since
// finding their (near) EOS is comparatively cheap.
async function computeSkySatelliteEvents(): Promise<{ visibleNow: SkySatellite[]; upcoming: SkySatellite[] }> {
  if (!homeCoordinates.value) return { visibleNow: [], upcoming: [] };

  const visibleNow: SkySatellite[] = [];
  const upcoming: SkySatellite[] = [];

  for (const sat of satellites.value) {
    if (selectedSatellite.value && selectedSatellite.value.name === sat.name) continue;

    const hasFM = sat.catalogNumber ? fmSatellitesLookup.value[sat.catalogNumber] || false : false;
    if (baofengMode.value && !hasFM) continue; // Skip non-FM satellites in Baofeng mode

    try {
      const currentlyVisible = getElevationAngleAt(sat.tle, Date.now()) > 0;
      if (!currentlyVisible && upcoming.length >= 15) continue;

      const event = findNextPassEvent(sat.tle, currentlyVisible);
      if (!event) continue;

      const entry: SkySatellite = {
        name: sat.name,
        tle: sat.tle,
        eventTime: event.time,
        eventType: event.type,
        catalogNumber: sat.catalogNumber,
        hasFM
      };

      if (event.type === 'EOS') {
        visibleNow.push(entry);
      } else {
        upcoming.push(entry);
      }
    } catch (e) {
      console.warn(`Failed to predict sky visibility for satellite ${sat.name}:`, e);
    }
  }

  visibleNow.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());
  upcoming.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());

  return { visibleNow, upcoming };
}

// Data for the "Satellites in your sky" panel: visible-now satellites (soonest EOS
// first), then upcoming satellites (soonest AOS first).
async function predictSkySatellites(): Promise<SkySatellite[]> {
  const { visibleNow, upcoming } = await computeSkySatelliteEvents();
  return [...visibleNow, ...upcoming];
}

// Selects satellites to render as map markers: currently-visible ones ranked by longest
// remaining time above the horizon (up to 10), padded with the soonest-upcoming
// satellites if fewer than 5 are currently visible.
function selectMapSatellites(visibleNow: SkySatellite[], upcoming: SkySatellite[]): SkySatellite[] {
  const longestRemainingFirst = [...visibleNow].sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());
  const selected = longestRemainingFirst.slice(0, 10);

  if (selected.length < 5) {
    selected.push(...upcoming.slice(0, 5 - selected.length));
  }

  return selected;
}

// Refreshes both the sky-satellites panel data and the map markers from a single scan.
// Set fitView to false for background/periodic refreshes that shouldn't move the camera.
async function refreshSkyState(fitView: boolean) {
  if (selectedSatellite.value || !homeCoordinates.value || satellites.value.length === 0) return;

  const { visibleNow, upcoming } = await computeSkySatelliteEvents();
  skySatellites.value = [...visibleNow, ...upcoming];
  console.log(`Predicted ${skySatellites.value.length} satellites in the sky`);

  const mapSats = selectMapSatellites(visibleNow, upcoming);

  if (!skySatellitesFeature.value) {
    skySatellitesFeature.value = new SkySatellitesFeature(mapLayers.vectorSource);
  }
  skySatellitesFeature.value.updateSatellites(mapSats);
  skySatellitesFeature.value.startTracking();

  if (!fitView || !mapInstance.value || mapSats.length === 0) return;

  // Fit the view to include home and all displayed satellites
  const home = homeCoordinates.value;
  const homePoint = fromLonLat([home.lon, home.lat]);
  let minX = homePoint[0];
  let minY = homePoint[1];
  let maxX = homePoint[0];
  let maxY = homePoint[1];

  const now = Date.now();
  mapSats.forEach(sat => {
    try {
      const position = getLatLngObj(sat.tle, now);
      const satPoint = fromLonLat([position.lng, position.lat]);
      minX = Math.min(minX, satPoint[0]);
      minY = Math.min(minY, satPoint[1]);
      maxX = Math.max(maxX, satPoint[0]);
      maxY = Math.max(maxY, satPoint[1]);
    } catch (e) {
      console.warn(`Failed to compute position for satellite ${sat.name}:`, e);
    }
  });

  const width = maxX - minX;
  const height = maxY - minY;
  const padding = [width * 0.2, height * 0.2];
  const extent = [
    minX - padding[0],
    minY - padding[1],
    maxX + padding[0],
    maxY + padding[1]
  ];

  mapInstance.value.getView().fit(extent, {
    duration: 1000,
    padding: [50, 50, 50, 50]
  });
}

function getElevationAngleAt(tle: [string, string], timeMs: number): number {
  if (!homeCoordinates.value) return -90;
  const position = getLatLngObj(tle, timeMs);
  const satInfo = getSatelliteInfo(tle, timeMs);
  const info = calculateSatelliteInfo(
    homeCoordinates.value.lat,
    homeCoordinates.value.lon,
    (elevation.value ?? 0) + aglHeight.value,
    position.lat,
    position.lng,
    satInfo.height
  );
  return info.elevationAngle;
}

// Finds the next AOS (rise above horizon) or EOS (drop below horizon) for the given
// satellite, searching forward from now. EOS passes are short, so it uses a finer
// coarse step and shorter search horizon than AOS.
function findNextPassEvent(tle: [string, string], currentlyVisible: boolean): { type: 'AOS' | 'EOS'; time: Date } | null {
  if (!homeCoordinates.value) return null;

  const type: 'AOS' | 'EOS' = currentlyVisible ? 'EOS' : 'AOS';
  const now = Date.now();
  const coarseStepMs = currentlyVisible ? 15 * 1000 : 60 * 1000;
  const coarseSteps = currentlyVisible ? 4 * 60 * 4 : 24 * 60; // 4h at 15s steps, 24h at 60s steps

  let prevTime = now;
  let prevVisible = currentlyVisible;

  for (let i = 1; i <= coarseSteps; i++) {
    const checkTime = now + i * coarseStepMs;
    const visible = getElevationAngleAt(tle, checkTime) > 0;

    if (visible !== prevVisible) {
      // Crossing found between prevTime and checkTime — refine it
      const fineSteps = 30;
      const fineStepMs = coarseStepMs / fineSteps;
      for (let j = 1; j <= fineSteps; j++) {
        const fineTime = prevTime + j * fineStepMs;
        if ((getElevationAngleAt(tle, fineTime) > 0) === visible) {
          return { type, time: new Date(fineTime) };
        }
      }
      return { type, time: new Date(checkTime) };
    }

    prevTime = checkTime;
    prevVisible = visible;
  }

  return null;
}

// Recomputes the countdown to the next AOS/EOS for the tracked satellite, only
// re-searching for the next event once the previous one has passed.
function updatePassEventCountdown(tle: [string, string]) {
  const nowMs = Date.now();
  const currentlyVisible = (satelliteInfo.value?.elevationAngle ?? -90) > 0;

  if (!nextPassEvent.value || nowMs >= nextPassEvent.value.time.getTime()) {
    nextPassEvent.value = findNextPassEvent(tle, currentlyVisible);
  }

  passEventRemainingSeconds.value = nextPassEvent.value
    ? Math.max(0, Math.round((nextPassEvent.value.time.getTime() - nowMs) / 1000))
    : null;
}

async function updateSkySatellites() {
  const satellites = await predictSkySatellites();
  skySatellites.value = satellites;
}

// Update the upcoming satellites when needed
watch([homeCoordinates, () => selectedSatellite.value?.name], () => {
  void updateSkySatellites();
});

// Initial update
void updateSkySatellites();

// Watch for changes in home coordinates
watch(homeCoordinates, async (newCoords) => {
  if (!newCoords) return;
  
  saveSetting('homeLocation', newCoords);
  elevation.value = null;
  
  await fetchElevation(newCoords.lat, newCoords.lon);
  
  if (elevation.value !== null) {
    homeLocationFeature.updateHorizon(elevation.value + aglHeight.value);
  }
  
  // Update satellite distances (for the search dropdown) and show satellites in the
  // sky on the map if none is selected
  if (satellites.value.length > 0) {
    updateSatelliteDistances(satellites.value);

    if (!selectedSatellite.value) {
      await refreshSkyState(true);
    }
  }
}, { deep: true });

// Watch for changes in selectedSatellite
watch(selectedSatellite, async (newSatellite) => {
  // Update page title
  document.title = newSatellite ? `Tracking ${newSatellite.name}` : 'HamSats by LY2EN';

  // Save selection state (including empty string for no selection)
  saveSetting('selectedSatellite', newSatellite);

  // Update URL with satellite ID if selected
  if (newSatellite) {
    const satellite = satellites.value.find(sat => sat.name === newSatellite.name);
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
    currentSatelliteFeature.value = null;
  }

  // Reset AOS/EOS countdown; it gets recomputed for the newly selected satellite below
  nextPassEvent.value = null;
  passEventRemainingSeconds.value = null;

  // Stop tracking sky satellites shown on the map if we're selecting a specific satellite
  if (skySatellitesFeature.value && newSatellite) {
    skySatellitesFeature.value.stopTracking();
  }

  if (newSatellite) {
    const satellite = satellites.value.find(sat => sat.name === newSatellite.name);
    
    if (satellite) {
      // Create new satellite feature only after old one is completely removed
      currentSatelliteFeature.value = new SatelliteFeature(
        satellite.name,
        satellite.tle,
        mapLayers.vectorSource,
        mapLayers.lineSource
      );
      
      currentSatelliteFeature.value.setShowPath(showPath.value);

      // Draw coverage circle immediately — elevation not required for this
      const satPosition = currentSatelliteFeature.value.getCurrentPosition();
      if (homeCoordinates.value && elevation.value !== null) {
        satelliteInfo.value = currentSatelliteFeature.value.updatePosition(
          homeCoordinates.value,
          elevation.value + aglHeight.value
        );
        updatePassEventCountdown(satellite.tle);
      } else {
        currentSatelliteFeature.value.updatePosition();
      }

      // Wait for OL to paint the circle (two rAF cycles) before starting the zoom animation
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await fitViewForSatellite(satPosition);

      // Start tracking with periodic updates
      const updateInterval = window.setInterval(() => {
        if (homeCoordinates.value && elevation.value !== null) {
          satelliteInfo.value = currentSatelliteFeature.value?.updatePosition(
            homeCoordinates.value,
            elevation.value + aglHeight.value
          ) || null;
          updatePassEventCountdown(satellite.tle);
        }
      }, 1000);

      currentSatelliteFeature.value.setUpdateInterval(updateInterval);
    }
  } else {
    satelliteInfo.value = null;
    // When no satellite is selected, show satellites in the sky on the map
    if (homeCoordinates.value && satellites.value.length > 0) {
      await refreshSkyState(true);
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

// Function to handle selection of an upcoming satellite
function selectUpcomingSatellite(name: string) {
  const satellite = satellites.value.find(sat => sat.name === name);
  if (satellite) {
    selectedSatellite.value = { name: satellite.name, tle: satellite.tle };
  }
}

// Update the watch expressions
watch([homeCoordinates, selectedSatellite], async () => {
  if (homeCoordinates.value) {
    skySatellites.value = await predictSkySatellites();
  }
});

// Initialize map on component mount
onMounted(async () => {
  showPath.value = loadSetting('showPath', false);
  
  await loadFmSatellitesLookup(); // Load FM satellites lookup data
  
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

  // Allow clicking the map to place the home pin when none is set yet
  mapInstance.value.on('singleclick', (event) => {
    if (homeCoordinates.value) return;
    const lonLat = toLonLat(event.coordinate);
    const coords = { lon: lonLat[0], lat: lonLat[1] };
    homeCoordinates.value = coords;
    homeLocationFeature.setLocation(coords);
    saveSetting('homeLocation', coords);
    fetchElevation(coords.lat, coords.lon);
    geoError.value = null;
  });

  // Load saved home location
  const savedHomeLocation = loadSetting<HomeLocationCoordinates | null>('homeLocation', null);
  if (savedHomeLocation) {
    homeCoordinates.value = savedHomeLocation;
    homeLocationFeature.setLocation(savedHomeLocation);
    fetchElevation(savedHomeLocation.lat, savedHomeLocation.lon);
    
    // Center map on home location
    const point = fromLonLat([savedHomeLocation.lon, savedHomeLocation.lat]);
    mapInstance.value.getView().setCenter(point);
    mapInstance.value.getView().setZoom(8);
  }

  skySatellitesFeature.value = new SkySatellitesFeature(mapLayers.vectorSource);
  skySatellitesFeature.value.setMap(mapInstance.value);
  skySatellitesFeature.value.setClickHandler((name) => {
    const satellite = satellites.value.find(sat => sat.name === name);
    if (satellite) {
      selectedSatellite.value = { name: satellite.name, tle: satellite.tle };
    }
  });

  await loadSatellites();
  
  // Start periodic updates
  const updateInterval = 60000; // 1 minute
  const updateTimer = setInterval(async () => {
    await refreshSkyState(false); // Refresh data only — don't move the map view
  }, updateInterval);

  // Clean up interval on unmount
  onUnmounted(() => {
    clearInterval(updateTimer);
  });
});

// Clean up on component unmount
onUnmounted(() => {
  if (currentSatelliteFeature.value) {
    currentSatelliteFeature.value.stopTracking();
  }
  if (skySatellitesFeature.value) {
    skySatellitesFeature.value.stopTracking();
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
  pointer-events: none;

  &.top-right {
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: calc(100% - 20px);
  }
}

.top-row-controls {
  display: contents;
}

@media (max-width: 640px) {
  .custom-controls {
    &.top-right {
      width: calc(100% - 20px);
    }
  }

  .top-row-controls {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 4px;
    pointer-events: none;
    min-width: 0;
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
  border-radius: var(--radius-md);
  padding: 2px;
  z-index: 1000;
  
  button {
    background-color: var(--color-primary);
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
      background-color: var(--color-primary-hover);
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
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }
  
  .ol-zoom-out {
    border-radius: 0 0 4px 4px;
  }
}

.ol-rotate {
  right: 10px !important;
  
  button {
    border-radius: var(--radius-md);
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