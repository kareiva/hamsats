<template>
  <div class="upcoming-satellites-control" v-if="upcomingSatellites.length > 0">
    <div class="control-header" @click="toggleExpanded">
      <h3>Upcoming Visible Satellites</h3>
      <span class="toggle-icon">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div class="satellite-list" v-if="expanded">
      <div v-for="satellite in sortedSatellites" :key="satellite.name" class="satellite-item">
        <div class="satellite-name">{{ satellite.name }}</div>
        <div class="satellite-time">
          {{ formatVisibilityTime(satellite.visibleAt) }}
        </div>
        <button class="track-button" @click="selectSatellite(satellite.name)">
          Track
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface UpcomingSatellite {
  name: string;
  tle: [string, string];
  visibleAt: Date;
}

const props = defineProps<{
  upcomingSatellites: UpcomingSatellite[];
}>();

const emit = defineEmits<{
  (e: 'select-satellite', name: string): void;
}>();

const expanded = ref(true);
const sortedSatellites = computed(() => [...props.upcomingSatellites].sort((a, b) => 
  a.visibleAt.getTime() - b.visibleAt.getTime()
));

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function selectSatellite(name: string) {
  emit('select-satellite', name);
}

function formatVisibilityTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) {
    return `in ${diffMins} min`;
  } else {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `in ${hours}h ${mins}m`;
  }
}
</script>

<style lang="scss" scoped>
.upcoming-satellites-control {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 300px;
  overflow: hidden;
  margin-top: 10px;
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

.satellite-list {
  max-height: 300px;
  overflow-y: auto;
}

.satellite-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  
  &:last-child {
    border-bottom: none;
  }
  
  .satellite-name {
    flex: 1;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 8px;
  }
  
  .satellite-time {
    font-size: 12px;
    color: #666;
    margin-right: 8px;
    white-space: nowrap;
  }
  
  .track-button {
    background-color: #0078d4;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    
    &:hover {
      background-color: #0063b1;
    }
  }
}

@media (max-width: 640px) {
  .upcoming-satellites-control {
    max-width: 100%;
  }
}
</style> 