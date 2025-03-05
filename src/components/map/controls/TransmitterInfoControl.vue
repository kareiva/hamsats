<template>
  <div class="transmitter-info-control" v-if="transmitters.length > 0">
    <div class="control-header" @click="toggleExpanded">
      <h3>Transmitters ({{ transmitters.length }})</h3>
      <span class="toggle-icon">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div class="transmitter-list" v-if="expanded">
      <div v-for="(tx, index) in transmitters" :key="index" class="transmitter-item">
        <div class="transmitter-description">{{ tx.description }}</div>
        <div class="transmitter-details">
          <div v-if="tx.uplink_low" class="frequency uplink">
            <span class="label">↑</span> {{ formatFrequency(tx.uplink_low) }} {{ tx.uplink_mode }}
          </div>
          <div v-if="tx.downlink_low" class="frequency downlink">
            <span class="label">↓</span> {{ formatFrequency(tx.downlink_low) }} {{ tx.mode }}
          </div>
        </div>
      </div>
    </div>
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Transmitter {
  description: string;
  uplink_low: number | null;
  uplink_mode: string | null;
  downlink_low: number | null;
  mode: string;
  alive: boolean;
}

const props = defineProps<{
  catalogNumber: string | undefined;
}>();

const transmitters = ref<Transmitter[]>([]);
const expanded = ref(true);
const error = ref<string | null>(null);

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function formatFrequency(frequency: number): string {
  if (frequency >= 1000000000) {
    return (frequency / 1000000000).toFixed(3) + ' GHz';
  } else {
    return (frequency / 1000000).toFixed(3) + ' MHz';
  }
}

async function fetchTransmitters() {
  if (!props.catalogNumber) {
    transmitters.value = [];
    return;
  }
  
  try {
    error.value = null;
    
    // Try to load from local file first
    const localResponse = await fetch(`/transponders/${props.catalogNumber}.json`);
    
    if (localResponse.ok) {
      const data = await localResponse.json();
      transmitters.value = data.filter((tx: Transmitter) => tx.alive);
      
      if (transmitters.value.length === 0) {
        error.value = "No active transmitters found for this satellite";
      }
      return;
    }
    
    // Fallback to API if local file not found
    console.warn(`Local transmitter data not found for satellite ${props.catalogNumber}, falling back to API`);
    const apiResponse = await fetch(`https://db.satnogs.org/api/transmitters/?alive=true&format=json&satellite__norad_cat_id=${props.catalogNumber}`);
    
    if (!apiResponse.ok) {
      throw new Error(`Failed to fetch transmitter data: ${apiResponse.status}`);
    }
    
    const data = await apiResponse.json();
    transmitters.value = data.filter((tx: Transmitter) => tx.alive);
    
    if (transmitters.value.length === 0) {
      error.value = "No active transmitters found for this satellite";
    }
  } catch (err) {
    console.error('Error fetching transmitter data:', err);
    error.value = "Failed to load transmitter data";
    transmitters.value = [];
  }
}

// Watch for changes in catalog number
watch(() => props.catalogNumber, (newCatalogNumber) => {
  if (newCatalogNumber) {
    fetchTransmitters();
  } else {
    transmitters.value = [];
  }
}, { immediate: true });
</script>

<style lang="scss" scoped>
.transmitter-info-control {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 300px;
  overflow: hidden;
  margin-top: 10px;
  z-index: 1010;
}

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #f0f0f0;
  cursor: pointer;
  
  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #333;
  }
  
  .toggle-icon {
    font-size: 12px;
    color: #666;
  }
}

.transmitter-list {
  max-height: 300px;
  overflow-y: auto;
}

.transmitter-item {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  
  &:last-child {
    border-bottom: none;
  }
  
  .transmitter-description {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 4px;
  }
  
  .transmitter-details {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    
    .frequency {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 3px;
      
      &.uplink {
        background-color: rgba(0, 128, 0, 0.1);
        color: #006400;
      }
      
      &.downlink {
        background-color: rgba(0, 0, 128, 0.1);
        color: #000064;
      }
      
      .label {
        font-weight: bold;
        margin-right: 4px;
      }
    }
  }
}

.error-message {
  padding: 8px 12px;
  font-size: 12px;
  color: #721c24;
  background-color: #f8d7da;
  text-align: center;
}

@media (max-width: 640px) {
  .transmitter-info-control {
    max-width: 100%;
  }
}
</style> 