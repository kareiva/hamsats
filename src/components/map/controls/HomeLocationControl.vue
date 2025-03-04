<template>
  <div class="home-location-control">
    <div class="control-header">
      <button @click="$emit('set-home')" class="home-button">Set Home Location</button>
      <button v-if="homeCoordinates" @click="showSlider = !showSlider" class="toggle-button">
        {{ showSlider ? '−' : '+' }} AGL: {{ aglHeight }}m
      </button>
    </div>
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
}>();

const emit = defineEmits<{
  (e: 'set-home'): void;
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
  gap: 5px;
  background-color: rgba(255, 255, 255, 0.7);
  border-radius: 4px;
  padding: 8px;
  
  .control-header {
    display: flex;
    gap: 5px;
    
    button {
      background-color: rgba(0, 60, 136, 0.7);
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px;
      font-size: 14px;
      cursor: pointer;
      white-space: nowrap;
      flex: 1;
      
      &:hover {
        background-color: rgba(0, 60, 136, 0.9);
      }
      
      &.toggle-button {
        background-color: rgba(0, 60, 136, 0.5);
        
        &:hover {
          background-color: rgba(0, 60, 136, 0.7);
        }
      }
    }
  }
  
  .slider-container {
    margin-top: 5px;
    
    .vertical-slider-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 150px;
      position: relative;
      margin: 10px auto;
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
          background: rgba(0, 60, 136, 0.9);
          cursor: pointer;
          -webkit-appearance: none;
          margin-top: -6px;
        }
        
        &::-webkit-slider-runnable-track {
          height: 4px;
          background: #ddd;
          border-radius: 2px;
        }
        
        &::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: rgba(0, 60, 136, 0.9);
          cursor: pointer;
        }
        
        &::-moz-range-track {
          height: 4px;
          background: #ddd;
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
}

@media (max-width: 640px) {
  .home-location-control {
    max-width: calc(100vw - 20px);
    
    .control-header {
      flex-direction: column;
      
      button {
        width: 100%;
      }
    }
  }
}
</style> 