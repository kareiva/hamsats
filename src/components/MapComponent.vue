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
        <div class="satellite-selector" v-if="homeCoordinates">
          <label for="satellite-select">Select Satellite:</label>
          <select id="satellite-select" v-model="selectedSatellite" class="satellite-dropdown">
            <option value="">-- Select a satellite --</option>
            <option v-for="sat in satellites" :key="sat.name" :value="sat.name">
              {{ sat.name }}
            </option>
          </select>
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
import { onMounted, ref, watch, onUnmounted } from 'vue';
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
import { getLatLngObj, getSatelliteInfo } from 'tle.js';
import satelliteIcon from '@/assets/satellite.svg';
import LineString from 'ol/geom/LineString';

const mapInstance = ref<Map | null>(null);
const homeFeature = ref<Feature | null>(null);
const vectorSource = ref<VectorSource | null>(null);
const horizonSource = ref<VectorSource | null>(null);
const homeCoordinates = ref<{ lat: number; lon: number } | null>(null);
const elevation = ref<number | null>(null);
const horizonFeature = ref<Feature | null>(null);
const aglHeight = ref<number>(0); // Default AGL height is 0 meters
const selectedSatellite = ref<string>(''); // Selected satellite
const satellites = ref<{ name: string; tle: string[] }[]>([]);
const satelliteFeature = ref<Feature | null>(null);
const positionUpdateInterval = ref<number | null>(null);
const lineOfSightFeature = ref<Feature | null>(null);
const lineSource = ref<VectorSource | null>(null);

// Watch for changes in selectedSatellite to save to session storage
watch(selectedSatellite, (newSatellite) => {
  if (newSatellite) {
    sessionStorage.setItem('selectedSatellite', newSatellite);
    console.log(`Saved selected satellite to session: ${newSatellite}`);
    startSatelliteTracking(newSatellite);
  } else {
    stopSatelliteTracking();
  }
});

// Function to load satellites from file
async function loadSatellites() {
  try {
    const response = await fetch('/elements/amateur.txt');
    if (!response.ok) {
      throw new Error(`Failed to load satellites: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    const lines = text.split('\n');
    const satelliteList: { name: string; tle: string[] }[] = [];
    
    // Process TLE data (3 lines per satellite: name, line1, line2)
    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 < lines.length) {
        const name = lines[i].trim();
        const line1 = lines[i + 1].trim();
        const line2 = lines[i + 2].trim();
        
        // Validate TLE format (basic check)
        if (name && line1 && line2 && line1.startsWith('1 ') && line2.startsWith('2 ')) {
          satelliteList.push({
            name,
            tle: [line1, line2]
          });
        }
      }
    }
    
    satellites.value = satelliteList;
    console.log(`Loaded ${satelliteList.length} satellites from file`);
    
    // Load saved satellite selection or set default to ISS
    loadSavedSatelliteSelection();
  } catch (error) {
    console.error('Error loading satellites:', error);
    
    // Try loading from the project space directly
    try {
      const response = await fetch('/src/elements/amateur.txt');
      if (!response.ok) {
        throw new Error(`Failed to load satellites from project space: ${response.status} ${response.statusText}`);
      }
      
      const text = await response.text();
      const lines = text.split('\n');
      const satelliteList: { name: string; tle: string[] }[] = [];
      
      // Process TLE data (3 lines per satellite: name, line1, line2)
      for (let i = 0; i < lines.length; i += 3) {
        if (i + 2 < lines.length) {
          const name = lines[i].trim();
          const line1 = lines[i + 1].trim();
          const line2 = lines[i + 2].trim();
          
          // Validate TLE format (basic check)
          if (name && line1 && line2 && line1.startsWith('1 ') && line2.startsWith('2 ')) {
            satelliteList.push({
              name,
              tle: [line1, line2]
            });
          }
        }
      }
      
      satellites.value = satelliteList;
      console.log(`Loaded ${satelliteList.length} satellites from project space`);
      
      // Load saved satellite selection or set default to ISS
      loadSavedSatelliteSelection();
    } catch (secondError) {
      console.error('Error loading satellites from project space:', secondError);
      // Fallback to sample satellites if file loading fails
      satellites.value = [
        { name: 'ISS (ZARYA)', tle: ['1 25544U 98067A   17206.18396726  .00001961  00000-0  36771-4 0  9993', '2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.54225995 67660'] },
        { name: 'NOAA-19', tle: ['1 33591U 09005A   23305.51689030  .00000076  00000+0  65128-4 0  9992', '2 33591  99.1949 150.2287 0013223 223.4876 136.5274 14.12501878 761962'] },
        { name: 'AMSAT-OSCAR 7', tle: ['1 07530U 74089B   23305.84246462 -.00000030  00000+0  10000-3 0  9996', '2 07530 101.4038 287.7831 0011925 349.4315  10.6549 12.53637849 26729'] }
      ];
      
      // Load saved satellite selection or set default to ISS
      loadSavedSatelliteSelection();
    }
  }
}

// Function to load saved satellite selection or set default
function loadSavedSatelliteSelection() {
  const savedSatellite = sessionStorage.getItem('selectedSatellite');
  
  if (savedSatellite) {
    // Check if the saved satellite exists in the current list
    const satelliteExists = satellites.value.some(sat => sat.name === savedSatellite);
    
    if (satelliteExists) {
      selectedSatellite.value = savedSatellite;
      console.log(`Loaded saved satellite selection: ${savedSatellite}`);
    } else {
      // If saved satellite doesn't exist in current list, default to ISS
      setDefaultSatellite();
    }
  } else {
    // If no saved selection, default to ISS
    setDefaultSatellite();
  }
}

// Function to set default satellite to ISS
function setDefaultSatellite() {
  const issIndex = satellites.value.findIndex(sat => sat.name.includes('ISS'));
  
  if (issIndex >= 0) {
    selectedSatellite.value = satellites.value[issIndex].name;
    console.log(`Set default satellite to: ${selectedSatellite.value}`);
  } else if (satellites.value.length > 0) {
    // If ISS not found, use the first satellite in the list
    selectedSatellite.value = satellites.value[0].name;
    console.log(`ISS not found, using first satellite: ${selectedSatellite.value}`);
  }
}

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
    // Clear any existing horizon first to avoid stacking
    if (horizonFeature.value) {
      horizonSource.value.removeFeature(horizonFeature.value);
      horizonFeature.value = null;
    }
    
    // Create a circle geometry directly instead of using circular polygon
    const circleGeometry = new Circle(homePoint, horizonDistanceM);
    
    // Create a feature with the circle geometry
    horizonFeature.value = new Feature({
      geometry: circleGeometry,
      properties: {
        animationTimestamp: Date.now() // Add timestamp for animation
      }
    });
    
    // Style the horizon with blue colors and animation class
    horizonFeature.value.setStyle(
      new Style({
        fill: new Fill({
          color: 'rgba(0, 70, 255, 0.33)' // Blue fill with 33% opacity
        }),
        zIndex: 100, // Ensure high z-index
        className: 'horizon-feature fade-in' // Add classes for styling
      })
    );
    
    // Add the feature to the horizon source immediately
    horizonSource.value.addFeature(horizonFeature.value);
    
    // Force immediate rendering
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

function isSatelliteVisible(observerLat: number, observerLon: number, observerAlt: number, 
                          satLat: number, satLon: number, satAlt: number): boolean {
  // Earth radius in kilometers
  const R = 6371;
  
  // Convert all angles to radians
  const lat1 = observerLat * Math.PI / 180;
  const lon1 = observerLon * Math.PI / 180;
  const lat2 = satLat * Math.PI / 180;
  const lon2 = satLon * Math.PI / 180;
  
  // Calculate great circle distance
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  // Convert altitudes to kilometers
  const h1 = observerAlt / 1000;
  const h2 = satAlt;
  
  // Calculate the angle between the horizon and the satellite
  const alpha = Math.acos((R + h1) / (R + h2));
  const beta = Math.acos(R / (R + h1));
  
  // Calculate the central angle between observer and satellite
  const centralAngle = distance / R;
  
  // The satellite is visible if the central angle is less than alpha + beta
  return centralAngle < (alpha + beta);
}

function createCurvedLine(start: number[], end: number[], numPoints: number = 50): number[][] {
  const points: number[][] = [];
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    // Use spherical interpolation
    const lat = start[1] + t * (end[1] - start[1]);
    const lon = start[0] + t * (end[0] - start[0]);
    points.push(fromLonLat([lon, lat]));
  }
  
  return points;
}

function updateSatellitePosition(tle: string[]) {
  if (!satelliteFeature.value || !homeCoordinates.value) return;

  try {
    // Get current position and velocity
    const satInfo = getSatelliteInfo(tle);
    const position = getLatLngObj(tle);
    
    // Convert to map coordinates for satellite
    const satPoint = fromLonLat([position.lng, position.lat]);
    
    // Update the satellite feature's geometry
    satelliteFeature.value.setGeometry(new Point(satPoint));
    
    // Update line of sight if we have home coordinates
    if (homeCoordinates.value && lineOfSightFeature.value && elevation.value !== null) {
      const observerAlt = elevation.value + Number(aglHeight.value);
      const isVisible = isSatelliteVisible(
        homeCoordinates.value.lat,
        homeCoordinates.value.lon,
        observerAlt,
        position.lat,
        position.lng,
        satInfo.height
      );
      
      // Create curved line points
      const homePoint = fromLonLat([homeCoordinates.value.lon, homeCoordinates.value.lat]);
      const curvedPoints = createCurvedLine(
        [homeCoordinates.value.lon, homeCoordinates.value.lat],
        [position.lng, position.lat]
      );
      
      // Update line geometry and style
      lineOfSightFeature.value.setGeometry(new LineString(curvedPoints));
      lineOfSightFeature.value.setStyle(
        new Style({
          stroke: new Stroke({
            color: isVisible ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)',
            width: 2,
            lineDash: isVisible ? undefined : [5, 5]
          })
        })
      );
    }
    
    console.log(`Satellite position updated: ${position.lat}, ${position.lng}`);
  } catch (error) {
    console.error('Error updating satellite position:', error);
  }
}

function startSatelliteTracking(satelliteName: string) {
  // Stop any existing tracking
  stopSatelliteTracking();

  // Find the satellite's TLE data
  const satellite = satellites.value.find(sat => sat.name === satelliteName);
  if (!satellite || !vectorSource.value || !lineSource.value) return;

  // Create a new feature for the satellite
  satelliteFeature.value = new Feature();
  satelliteFeature.value.setStyle(
    new Style({
      image: new Icon({
        src: satelliteIcon,
        scale: 1.5,
        anchor: [0.5, 0.5],
        rotation: Math.PI / 4
      })
    })
  );

  // Create line of sight feature
  lineOfSightFeature.value = new Feature();
  
  // Add features to sources
  vectorSource.value.addFeature(satelliteFeature.value);
  lineSource.value.addFeature(lineOfSightFeature.value);

  // Update position immediately and then every second
  updateSatellitePosition(satellite.tle);
  positionUpdateInterval.value = window.setInterval(() => {
    updateSatellitePosition(satellite.tle);
  }, 1000);
}

function stopSatelliteTracking() {
  if (positionUpdateInterval.value) {
    clearInterval(positionUpdateInterval.value);
    positionUpdateInterval.value = null;
  }

  if (satelliteFeature.value && vectorSource.value) {
    vectorSource.value.removeFeature(satelliteFeature.value);
    satelliteFeature.value = null;
  }

  if (lineOfSightFeature.value && lineSource.value) {
    lineSource.value.removeFeature(lineOfSightFeature.value);
    lineOfSightFeature.value = null;
  }
}

// Clean up on component unmount
onUnmounted(() => {
  stopSatelliteTracking();
});

onMounted(() => {
  // Load satellites from file
  loadSatellites();
  
  // Create vector source and layer for the home location marker
  vectorSource.value = new VectorSource();
  const vectorLayer = new VectorLayer({
    source: vectorSource.value,
    zIndex: 10 // Make sure it's above the base map and horizon
  });
  
  // Create vector source and layer for the horizon
  horizonSource.value = new VectorSource({
    wrapX: false // Prevent wrapping around the date line
  });
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
    }),
    className: 'horizon-layer', // Add class for CSS targeting
    updateWhileAnimating: true, // Update during animations
    updateWhileInteracting: true // Update during interactions
  });
  
  // Create line source and layer for the line of sight
  lineSource.value = new VectorSource();
  const lineLayer = new VectorLayer({
    source: lineSource.value,
    zIndex: 8 // Between horizon and markers
  });
  
  // Create the map with proper view settings
  mapInstance.value = new Map({
    target: 'map',
    layers: [
      new TileLayer({
        source: new OSM()
      }),
      horizonLayer,
      lineLayer,    // Add line layer
      vectorLayer
    ],
    view: new View({
      center: [0, 0],
      zoom: 2,
      projection: 'EPSG:3857' // Explicitly set the projection to Web Mercator
    }),
    controls: defaultControls()
  });
  
  // Add translate interaction to make ONLY the marker draggable
  const translate = new Translate({
    features: vectorSource.value.getFeaturesCollection(),
    filter: (feature) => {
      // Only allow dragging the home location marker, not the horizon circle
      return feature === homeFeature.value;
    }
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
        // The horizon will be recalculated automatically via the watcher
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
  
  .satellite-selector {
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
    
    .satellite-dropdown {
      width: 100%;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background-color: white;
      font-size: 14px;
      color: #333;
      
      &:focus {
        outline: none;
        border-color: rgba(0, 60, 136, 0.7);
        box-shadow: 0 0 0 2px rgba(0, 60, 136, 0.3);
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
  
  /* Hide the collapse button */
  button {
    display: none !important;
  }
  
  /* Always show the attribution text */
  &.ol-collapsed ul {
    display: block !important;
  }
  
  /* Remove padding that was meant for the button */
  &.ol-collapsed {
    padding: 0 !important;
    background: none !important;
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

/* Horizon feature fade-in animation */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.horizon-layer canvas {
  animation: fadeIn 1s ease-in-out;
}
</style> 