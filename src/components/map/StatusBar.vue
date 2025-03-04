<template>
  <div class="status-bar">
    <div v-if="homeCoordinates">
      Home: {{ homeCoordinates.lat.toFixed(6) }}° N, {{ homeCoordinates.lon.toFixed(6) }}° E
      <span v-if="elevation !== null"> | ASL: {{ elevation.toFixed(1) }} m | AGL: {{ aglHeight }} m</span>
      <span v-if="selectedSatellite && satelliteInfo">
        | Sat: {{ satelliteInfo.distance.toFixed(1) }} km away
        | Azimuth: {{ satelliteInfo.azimuth.toFixed(1) }}°
        | Elevation: {{ satelliteInfo.elevationAngle.toFixed(1) }}°
      </span>
      <span v-else-if="selectedSatellite"> | Calculating satellite info...</span>
      <span v-else> | Select a satellite...</span>
    </div>
    <div v-else>No home location set</div>
  </div>
</template>

<script setup lang="ts">
import type { HomeLocationCoordinates } from './features/HomeLocation';
import type { SatelliteInfo } from './features/SatelliteFeature';

defineProps<{
  homeCoordinates: HomeLocationCoordinates | null;
  elevation: number | null;
  aglHeight: number;
  selectedSatellite: string | null;
  satelliteInfo: SatelliteInfo | null;
}>();
</script>

<style lang="scss" scoped>
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
</style> 