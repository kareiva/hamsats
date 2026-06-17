<template>
  <div class="status-bar">
    <div v-if="homeCoordinates" class="status-content" :class="{ 'sat-selected': selectedSatellite }">
      <div class="status-item location">
        <span class="label">Home:</span>
        {{ homeCoordinates.lat.toFixed(6) }}° N, {{ homeCoordinates.lon.toFixed(6) }}° E
      </div>
      <div v-if="elevation !== null" class="status-item elevation">
        <span class="label">ASL:</span> {{ elevation.toFixed(1) }}m
        <span class="label">AGL:</span> {{ aglHeight }}m
      </div>
      <div v-if="selectedSatellite && satelliteInfo" class="status-item satellite">
        <span class="label">Sat:</span> {{ satelliteInfo.distance.toFixed(1) }}km
        <span class="label">Az:</span> {{ satelliteInfo.azimuth.toFixed(1) }}°
        <span class="label">El:</span> {{ satelliteInfo.elevationAngle.toFixed(1) }}°
      </div>
      <div v-else-if="selectedSatellite" class="status-item">
        <span class="label">Sat:</span> Calculating...
      </div>
      <div v-else class="status-item">
        <span class="label">Sat:</span> None selected
      </div>
    </div>
    <div v-else class="status-content">
      <div class="status-item">No home location set</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HomeLocationCoordinates } from './features/HomeLocation';
import type { SatelliteInfo } from './features/SatelliteFeature';

interface SatelliteWithName {
  name: string;
  tle: [string, string];
}

defineProps<{
  homeCoordinates: HomeLocationCoordinates | null;
  elevation: number | null;
  aglHeight: number;
  selectedSatellite: SatelliteWithName | null;
  satelliteInfo: SatelliteInfo | null;
}>();
</script>

<style lang="scss" scoped>
.status-bar {
  min-height: 30px;
  background-color: #f0f0f0;
  border-top: 1px solid var(--color-border);
  padding: 5px 10px calc(5px + env(safe-area-inset-bottom, 0px));
  font-family: monospace;
  font-size: var(--text-data-size);
  
  .status-content {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: center;
    align-items: center;
    
    .status-item {
      white-space: nowrap;
      padding: 2px 5px;
      
      .label {
        color: #666;
        margin-right: 3px;
        
        &:not(:first-child) {
          margin-left: 8px;
        }
      }
    }
  }
}

@media (max-width: 640px) {
  .status-bar {
    font-size: var(--text-ui-sm-size);
    padding: 4px 6px max(56px, env(safe-area-inset-bottom, 0px));

    .status-content {
      gap: var(--space-1);

      .status-item {
        padding: 1px 3px;

        &.location {
          width: 100%;
          text-align: center;
          border-bottom: 1px solid var(--color-divider);
          padding-bottom: 3px;
          margin-bottom: 2px;
        }

        .label {
          &:not(:first-child) {
            margin-left: 4px;
          }
        }
      }

      &.sat-selected {
        .status-item.location,
        .status-item.elevation {
          display: none;
        }
      }
    }
  }
}

@media (max-width: 360px) {
  .status-bar {
    .status-content {
      .status-item {
        width: 100%;
        text-align: center;
        border-bottom: 1px solid var(--color-divider);
        padding-bottom: 2px;
        margin-bottom: 2px;

        &:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }

        &.location,
        &.elevation {
          display: none;
        }
      }
    }
  }
}
</style> 