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
        @keydown.down.prevent="navigateResults(1)"
        @keydown.up.prevent="navigateResults(-1)"
        @keydown.enter.prevent="selectHighlighted"
      />
      <button 
        v-if="selectedSatellite" 
        class="clear-button"
        @click="clearSelection"
        title="Clear selection"
      >×</button>
      <div class="autocomplete-list" v-if="showAutocomplete && filteredSatellites.length > 0">
        <div
          v-for="(sat, index) in filteredSatellites"
          :key="sat.name"
          class="autocomplete-item"
          :class="{ 
            'selected': sat.name === selectedSatellite?.name,
            'highlighted': index === highlightedIndex 
          }"
          @click="selectSatellite(sat.name)"
        >
          {{ sat.name }}{{ sat.distance !== undefined ? ` (${sat.distance.toFixed(0)} km)` : '' }}
        </div>
      </div>
    </div>
    <div class="controls">
      <label class="control-item baofeng-mode">
        <input type="checkbox" v-model="baofengMode"> Baofeng (FM) mode
      </label>
    </div>
    <div class="controls" v-if="selectedSatellite">
      <label class="control-item">
        <input type="checkbox" v-model="localShowPath"> Show future path
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { HomeLocationCoordinates } from '../features/HomeLocation';

interface SatelliteWithName {
  name: string;
  tle: [string, string];
  position?: { lat: number; lng: number; height: number };
  distance?: number;
  catalogNumber?: string;
}

const props = defineProps<{
  homeCoordinates: HomeLocationCoordinates | null;
  satellites: SatelliteWithName[];
  selectedSatellite: SatelliteWithName | null;
  showPath: boolean;
  baofengMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:selected-satellite', value: SatelliteWithName | null): void;
  (e: 'update:show-path', value: boolean): void;
  (e: 'update:baofeng-mode', value: boolean): void;
}>();

const searchQuery = ref('');
const showAutocomplete = ref(false);
const localShowPath = ref(props.showPath);
const highlightedIndex = ref(-1);
const baofengMode = ref(props.baofengMode);
const filteredResults = ref<SatelliteWithName[]>([]);

// Cache for FM satellite status
const fmSatelliteCache = new Map<string, boolean>();

async function checkIfSatelliteHasFM(catalogNumber: string): Promise<boolean> {
  if (fmSatelliteCache.has(catalogNumber)) {
    return fmSatelliteCache.get(catalogNumber)!;
  }

  try {
    const response = await fetch(`/transponders/${catalogNumber}.json`);
    if (!response.ok) return false;
    
    const transmitters = await response.json();
    const hasFM = transmitters.some((tx: any) => 
      tx.alive && (
        (tx.mode && tx.mode.includes('FM')) || 
        (tx.uplink_mode && tx.uplink_mode.includes('FM'))
      )
    );
    
    fmSatelliteCache.set(catalogNumber, hasFM);
    return hasFM;
  } catch (error) {
    console.error('Error checking FM mode:', error);
    return false;
  }
}

async function updateFilteredSatellites() {
  const query = searchQuery.value.toLowerCase();
  let filtered = props.satellites.filter(sat => sat.name.toLowerCase().includes(query));
  
  if (baofengMode.value) {
    const fmChecks = await Promise.all(
      filtered.map(async sat => {
        if (!sat.catalogNumber) return false;
        return await checkIfSatelliteHasFM(sat.catalogNumber);
      })
    );
    filtered = filtered.filter((_, index) => fmChecks[index]);
  }
  
  filteredResults.value = filtered.slice(0, 10);
}

// Watch for changes that should trigger filtering
watch([searchQuery, baofengMode], () => {
  updateFilteredSatellites();
});

// Initial filtering
updateFilteredSatellites();

const filteredSatellites = computed(() => filteredResults.value);

function selectSatellite(name: string) {
  const satellite = props.satellites.find(sat => sat.name === name);
  if (satellite) {
    emit('update:selected-satellite', satellite);
    searchQuery.value = satellite.name;
    showAutocomplete.value = false;
    highlightedIndex.value = -1;
  }
}

function navigateResults(direction: number) {
  if (!showAutocomplete.value || filteredSatellites.value.length === 0) {
    showAutocomplete.value = true;
    highlightedIndex.value = 0;
    return;
  }

  highlightedIndex.value = Math.max(
    -1,
    Math.min(
      filteredSatellites.value.length - 1,
      highlightedIndex.value + direction
    )
  );
}

function selectHighlighted() {
  if (highlightedIndex.value >= 0 && highlightedIndex.value < filteredSatellites.value.length) {
    selectSatellite(filteredSatellites.value[highlightedIndex.value].name);
  }
}

function onSearchInput() {
  if (searchQuery.value === '') {
    emit('update:selected-satellite', null);
  }
  showAutocomplete.value = true;
  highlightedIndex.value = -1;
}

function clearSelection() {
  emit('update:selected-satellite', null);
  searchQuery.value = '';
  showAutocomplete.value = false;
  highlightedIndex.value = -1;
}

// Close autocomplete when clicking outside
window.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.satellite-selector')) {
    showAutocomplete.value = false;
    highlightedIndex.value = -1;
  }
});

watch(localShowPath, (newValue) => {
  emit('update:show-path', newValue);
});

watch(() => props.showPath, (newValue) => {
  localShowPath.value = newValue;
});

watch(() => props.selectedSatellite, (newValue) => {
  if (newValue && searchQuery.value !== newValue.name) {
    const satellite = props.satellites.find(sat => sat.name === newValue.name);
    if (satellite) {
      searchQuery.value = satellite.name;
    }
  }
});

watch(filteredSatellites, () => {
  highlightedIndex.value = -1;
});

// Watch for baofengMode changes
watch(baofengMode, (newValue) => {
  emit('update:baofeng-mode', newValue);
  clearSelection();  // Clear search field and selection when mode changes
  updateFilteredSatellites();
});
</script>

<style lang="scss" scoped>
.satellite-selector {
  margin-top: 10px;
  background-color: rgba(255, 255, 255, 0.7);
  padding: 8px;
  border-radius: 4px;
  max-width: calc(100vw - 20px);
  
  .search-container {
    position: relative;
    width: 100%;
    
    .search-input {
      width: 100%;
      padding: 8px;
      padding-right: 30px;
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

    .clear-button {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #666;
      font-size: 18px;
      line-height: 1;
      padding: 0 5px;
      cursor: pointer;
      
      &:hover {
        color: #333;
      }
    }
    
    .autocomplete-list {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: min(200px, 40vh);
      overflow-y: auto;
      background-color: white;
      border: 1px solid #ccc;
      border-radius: 0 0 4px 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      
      .autocomplete-item {
        padding: 8px;
        cursor: pointer;
        font-size: 14px;
        color: #333;
        
        &:hover {
          background-color: rgba(0, 60, 136, 0.1);
        }
        
        &.highlighted {
          background-color: rgba(0, 60, 136, 0.1);
        }
        
        &.selected {
          background-color: rgba(0, 60, 136, 0.2);
        }
        
        &.highlighted.selected {
          background-color: rgba(0, 60, 136, 0.3);
        }
      }
    }
  }
  
  .controls {
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    
    .control-item {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 14px;
      
      input[type="checkbox"] {
        cursor: pointer;
        width: 16px;
        height: 16px;
      }
      
      &.baofeng-mode {
        color: #2c3e50;
        font-weight: 500;
      }
    }
  }
}

@media (max-width: 640px) {
  .satellite-selector {
    .search-container {
      .autocomplete-list {
        max-height: min(150px, 30vh);
      }
    }
  }
}
</style> 