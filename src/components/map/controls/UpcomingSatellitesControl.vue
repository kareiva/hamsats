<template>
  <div class="upcoming-satellites-control" v-if="skySatellites.length > 0">
    <div class="control-header" @click="toggleExpanded">
      <h3>{{ baofengMode ? 'FM ' : '' }}Satellites in your sky</h3>
      <span class="toggle-icon">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div class="satellite-list" v-if="expanded">
      <div
        v-for="satellite in visibleSatellites"
        :key="satellite.name"
        class="satellite-item"
        :class="{ 'visible-now': satellite.eventType === 'EOS' }"
      >
        <div class="satellite-name">
          <span v-if="satellite.hasFM" class="fm-tag">FM</span>
          {{ satellite.name }}
        </div>
        <div class="satellite-time">
          {{ formatEventTime(satellite) }}
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

interface SkySatellite {
  name: string;
  tle: [string, string];
  eventTime: Date;
  eventType: 'AOS' | 'EOS';
  hasFM?: boolean;
}

const props = defineProps<{
  skySatellites: SkySatellite[];
  baofengMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-satellite', name: string): void;
}>();

const expanded = ref(window.innerWidth > 640);

// Already ordered by the parent: visible-now (EOS) satellites first, then upcoming
// (AOS) satellites, soonest first within each group.
const visibleSatellites = computed(() => props.skySatellites.slice(0, 10));

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function selectSatellite(name: string) {
  emit('select-satellite', name);
}

function formatEventTime(satellite: SkySatellite): string {
  const now = new Date();
  const diffMs = satellite.eventTime.getTime() - now.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));

  const relative = diffMins < 60
    ? `in ${diffMins} min`
    : `in ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;

  return `${satellite.eventType} ${relative}`;
}
</script>

<style lang="scss" scoped>
.upcoming-satellites-control {
  background-color: var(--color-panel-bg);
  border-radius: var(--radius-md);
  box-shadow: var(--color-panel-shadow);
  width: 100%;
  max-width: 300px;
  pointer-events: auto;
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
  border-left: 3px solid transparent;

  &:last-child {
    border-bottom: none;
  }

  &.visible-now {
    background-color: var(--color-accent-tint);
    border-left-color: var(--color-accent);

    .satellite-time {
      color: var(--color-accent);
    }
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
  background-color: rgba(0, 60, 136, 0.15);
  color: var(--color-primary);
  font-size: var(--text-ui-sm-size);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  margin-right: var(--space-1);
  font-weight: 600;
}

@media (max-width: 640px) {
  .upcoming-satellites-control {
    max-width: 100%;
  }
}
</style>
