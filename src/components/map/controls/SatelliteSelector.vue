<template>
  <div class="satellite-selector" v-if="homeCoordinates">
    <label for="satellite-select">Select Satellite:</label>
    <select id="satellite-select" :value="selectedSatellite" @input="e => emit('update:selectedSatellite', (e.target as HTMLSelectElement).value)" class="satellite-dropdown">
      <option value="">-- Select a satellite --</option>
      <option v-for="sat in satellites" :key="sat.name" :value="sat.name">
        {{ sat.name }}{{ sat.distance !== undefined ? ` (${sat.distance.toFixed(0)} km)` : '' }}
      </option>
    </select>
    <div class="path-control" v-if="selectedSatellite">
      <label>
        <input type="checkbox" v-model="localShowPath"> Show future path
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { HomeLocationCoordinates } from '../features/HomeLocation';

export interface Satellite {
  name: string;
  tle: [string, string];
  position?: {
    lat: number;
    lng: number;
    height: number;
  };
  distance?: number;
}

const props = defineProps<{
  homeCoordinates: HomeLocationCoordinates | null;
  satellites: Satellite[];
  selectedSatellite: string;
  showPath: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:selectedSatellite', value: string): void;
  (e: 'update:showPath', value: boolean): void;
}>();

const localShowPath = ref(props.showPath);

watch(localShowPath, (newValue) => {
  emit('update:showPath', newValue);
});

watch(() => props.showPath, (newValue) => {
  localShowPath.value = newValue;
});
</script>

<style lang="scss" scoped>
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
  
  .path-control {
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    
    label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      
      input[type="checkbox"] {
        cursor: pointer;
      }
    }
  }
}
</style> 