<template>
  <HeaderBar />
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import HeaderBar from '@/components/map/HeaderBar.vue';
</script>

<style>
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style> 