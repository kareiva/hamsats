<template>
  <div class="satellite-selector" v-if="homeCoordinates">
    <div class="search-container">
      <input
        type="text"
        class="search-input"
        placeholder="Search satellites..."
        v-model="searchQuery"
        @focus="showAutocomplete = true"
        @input="onSearchInput"
      />
      <div class="autocomplete-list" v-if="showAutocomplete && filteredSatellites.length > 0">
        <div
          v-for="sat in filteredSatellites"
          :key="sat.name"
          class="autocomplete-item"
          :class="{ 'selected': sat.name === selectedSatellite }"
          @click="selectSatellite(sat.name)"
        >
          {{ sat.name }}{{ sat.distance !== undefined ? ` (${sat.distance.toFixed(0)} km)` : '' }}
        </div>
      </div>
    </div>
    <div class="path-control" v-if="selectedSatellite">
      <label>
        <input type="checkbox" v-model="localShowPath"> Show future path
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
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

const searchQuery = ref('');
const showAutocomplete = ref(false);
const localShowPath = ref(props.showPath);

const filteredSatellites = computed(() => {
  const query = searchQuery.value.toLowerCase();
  return props.satellites
    .filter(sat => sat.name.toLowerCase().includes(query))
    .slice(0, 10); // Limit to 10 results for better performance
});

function selectSatellite(name: string) {
  emit('update:selectedSatellite', name);
  searchQuery.value = name;
  showAutocomplete.value = false;
}

function onSearchInput() {
  if (searchQuery.value === '') {
    emit('update:selectedSatellite', '');
  }
  showAutocomplete.value = true;
}

// Close autocomplete when clicking outside
window.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.satellite-selector')) {
    showAutocomplete.value = false;
  }
});

watch(localShowPath, (newValue) => {
  emit('update:showPath', newValue);
});

watch(() => props.showPath, (newValue) => {
  localShowPath.value = newValue;
});

watch(() => props.selectedSatellite, (newValue) => {
  if (newValue && newValue !== searchQuery.value) {
    const satellite = props.satellites.find(sat => sat.name === newValue);
    if (satellite) {
      searchQuery.value = satellite.name;
    }
  }
});
</script>

<style lang="scss" scoped>
.satellite-selector {
  margin-top: 10px;
  background-color: rgba(255, 255, 255, 0.7);
  padding: 8px;
  border-radius: 4px;
  
  .search-container {
    position: relative;
    width: 100%;
    
    .search-input {
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
    
    .autocomplete-list {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
      background-color: white;
      border: 1px solid #ccc;
      border-radius: 0 0 4px 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      
      .autocomplete-item {
        padding: 6px;
        cursor: pointer;
        font-size: 14px;
        color: #333;
        
        &:hover {
          background-color: rgba(0, 60, 136, 0.1);
        }
        
        &.selected {
          background-color: rgba(0, 60, 136, 0.2);
        }
      }
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