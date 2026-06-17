<template>
  <div class="upcoming-satellites-control" v-if="upcomingSatellites.length > 0">
    <div class="control-header" @click="toggleExpanded">
      <h3>Upcoming {{ baofengMode ? 'FM ' : '' }}Satellites</h3>
      <span class="toggle-icon">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div class="satellite-list" v-if="expanded">
      <div v-for="satellite in sortedSatellites" :key="satellite.name" class="satellite-item">
        <div class="satellite-name">
          <span v-if="satellite.hasFM" class="fm-tag">FM</span>
          {{ satellite.name }}
        </div>
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
  hasFM?: boolean;
}

const props = defineProps<{
  upcomingSatellites: UpcomingSatellite[];
  baofengMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-satellite', name: string): void;
}>();

const expanded = ref(window.innerWidth > 640);
const sortedSatellites = computed(() => {
  let satellites = [...props.upcomingSatellites];
  
  if (props.baofengMode) {
    satellites = satellites.filter(sat => sat.hasFM);
  }
  
  return satellites
    .sort((a, b) => a.visibleAt.getTime() - b.visibleAt.getTime())
    .slice(0, 10);
});

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
  border-radius: var(--radius-md);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 300px;
  overflow: hidden;
  margin-top: var(--space-2);
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
    font-size: var(--text-ui-size);
    font-weight: 600;
    color: #333;
  }

  .toggle-icon {
    font-size: var(--text-ui-sm-size);
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
  border-bottom: 1px solid var(--color-divider);
  
  &:last-child {
    border-bottom: none;
  }
  
  .satellite-name {
    flex: 1;
    font-size: var(--text-ui-size);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 8px;
  }
  
  .satellite-time {
    font-size: var(--text-ui-sm-size);
    color: #666;
    margin-right: 8px;
    white-space: nowrap;
  }
  
  .track-button {
    background-color: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-size: var(--text-ui-sm-size);
    cursor: pointer;

    &:hover {
      background-color: var(--color-primary-hover);
    }
  }
}

.fm-tag {
  background-color: #0078d4;
  color: white;
  font-size: var(--text-ui-sm-size);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  margin-right: 4px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .upcoming-satellites-control {
    max-width: 100%;
  }
}
</style> 