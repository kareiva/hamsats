<template>
  <div class="home-location-control">
    <div class="control-header">
      <button @click="$emit('toggle-home')" class="home-button" :class="{ 'clear': homeCoordinates }">
        {{ homeCoordinates ? 'Clear Home Location' : 'Set Home Location' }}
      </button>
      <button v-if="homeCoordinates" @click="showSlider = !showSlider" class="toggle-button">
        {{ showSlider ? '−' : '+' }} AGL: {{ aglHeight }}m
      </button>
    </div>
    <p v-if="!homeCoordinates && !geoError" class="hint">
      Tap the map to place your QTH, or use the button above.
    </p>
    <p v-if="geoError" class="geo-error">{{ geoError }}</p>
    <div v-if="homeCoordinates && showSlider" class="slider-container">
      <div class="vertical-slider-wrapper">
        <input 
          type="range" 
          id="agl-slider" 
          v-model="localAglHeight" 
          min="0" 
          max="500" 
          step="1"
          class="vertical-slider"
        >
        <div class="slider-markers">
          <span class="marker top">500m</span>
          <span class="marker middle">250m</span>
          <span class="marker bottom">0m</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { HomeLocationCoordinates } from '../features/HomeLocation';

const props = defineProps<{
  homeCoordinates: HomeLocationCoordinates | null;
  aglHeight: number;
  geoError: string | null;
}>();

const emit = defineEmits<{
  (e: 'toggle-home'): void;
  (e: 'update:aglHeight', value: number): void;
}>();

const localAglHeight = ref(props.aglHeight);
const showSlider = ref(false);

watch(localAglHeight, (newValue) => {
  emit('update:aglHeight', Number(newValue));
});

watch(() => props.aglHeight, (newValue) => {
  localAglHeight.value = newValue;
});
</script>

<style lang="scss" scoped>
.home-location-control {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background-color: var(--color-panel-bg);
  border-radius: var(--radius-md);
  box-shadow: var(--color-panel-shadow);
  padding: var(--space-2);

  .control-header {
    display: flex;
    gap: var(--space-2);
    
    button {
      background-color: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      padding: var(--space-2);
      font-size: var(--text-ui-size);
      cursor: pointer;
      white-space: nowrap;
      flex: 1;

      &:hover {
        background-color: var(--color-primary-hover);
      }

      &.clear {
        background-color: var(--color-danger);

        &:hover {
          background-color: var(--color-danger-hover);
        }
      }

      &.toggle-button {
        background-color: var(--color-primary-dim);

        &:hover {
          background-color: var(--color-primary-dim-hover);
        }
      }
    }
  }
  
  .slider-container {
    margin-top: var(--space-2);

    .vertical-slider-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 150px;
      position: relative;
      margin: var(--space-2) auto;
      width: 100%;
      
      .vertical-slider {
        width: 150px;
        margin: 0;
        transform: rotate(-90deg);
        transform-origin: center;
        position: absolute;
        left: calc(50% - 75px);
        
        &::-webkit-slider-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: var(--color-primary-hover);
          cursor: pointer;
          -webkit-appearance: none;
          margin-top: -6px;
        }

        &::-webkit-slider-runnable-track {
          height: 4px;
          background: var(--color-divider);
          border-radius: 2px;
        }

        &::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: var(--color-primary-hover);
          cursor: pointer;
        }
        
        &::-moz-range-track {
          height: 4px;
          background: var(--color-divider);
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

  .hint {
    font-size: var(--text-ui-sm-size);
    color: #666;
    text-align: center;
    padding: 0 var(--space-1);
  }

  .geo-error {
    font-size: var(--text-ui-sm-size);
    color: var(--color-danger-text);
    background-color: var(--color-danger-bg);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    text-align: center;
  }
}

@media (max-width: 640px) {
  .home-location-control {
    max-width: calc(100vw - 20px);

    .control-header {
      flex-direction: column;

      button {
        width: 100%;
      }

      .toggle-button {
        display: none;
      }
    }
  }
}
</style> 