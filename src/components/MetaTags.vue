<script setup lang="ts">
import { watch, onMounted } from 'vue';

const props = defineProps<{
  title?: string;
  description?: string;
  imageUrl?: string;
  url?: string;
  satelliteName?: string;
  homeLocation?: { lat: number; lon: number } | null;
}>();

// Function to update meta tags
function updateMetaTags() {
  // Set default values
  const baseUrl = 'https://www.hamsats.com';
  const defaultTitle = 'HamSats by LY2EN';
  const defaultDescription = 'Track amateur radio satellites in real-time. View satellite positions, predict passes, and get transmitter information for ham radio operators.';
  const defaultImage = `${baseUrl}/preview-large.png`;
  
  // Determine current values
  const title = props.satelliteName 
    ? `Tracking ${props.satelliteName} - HamSats by LY2EN` 
    : props.title || defaultTitle;
  
  const description = props.satelliteName 
    ? `Track ${props.satelliteName} satellite in real-time with azimuth, elevation, and distance information. Amateur radio satellite tracking tool.` 
    : props.description || defaultDescription;
  
  const imageUrl = props.imageUrl || defaultImage;
  
  // Build current URL with parameters if available
  let currentUrl = props.url || baseUrl;
  const urlParams = new URLSearchParams();
  
  if (props.satelliteName) {
    const satelliteId = document.querySelector('meta[name="satellite-id"]')?.getAttribute('content');
    if (satelliteId) {
      urlParams.set('id', satelliteId);
    }
  }
  
  if (props.homeLocation) {
    urlParams.set('lat', props.homeLocation.lat.toFixed(6));
    urlParams.set('lon', props.homeLocation.lon.toFixed(6));
  }
  
  const paramString = urlParams.toString();
  if (paramString) {
    currentUrl = `${baseUrl}/?${paramString}`;
  }
  
  // Update document title
  document.title = title;
  
  // Update meta tags
  updateMetaTag('name', 'title', title);
  updateMetaTag('name', 'description', description);
  
  // Update Open Graph tags
  updateMetaTag('property', 'og:title', title);
  updateMetaTag('property', 'og:description', description);
  updateMetaTag('property', 'og:url', currentUrl);
  updateMetaTag('property', 'og:image', imageUrl);
  
  // Update Twitter tags
  updateMetaTag('name', 'twitter:title', title);
  updateMetaTag('name', 'twitter:description', description);
  updateMetaTag('name', 'twitter:url', currentUrl);
  updateMetaTag('name', 'twitter:image', imageUrl);
  
  // Update Telegram tags
  updateMetaTag('property', 'telegram:image', imageUrl);
}

// Helper function to update a meta tag
function updateMetaTag(attributeName: string, attributeValue: string, content: string) {
  let metaTag = document.querySelector(`meta[${attributeName}="${attributeValue}"]`);
  
  if (!metaTag) {
    metaTag = document.createElement('meta');
    metaTag.setAttribute(attributeName, attributeValue);
    document.head.appendChild(metaTag);
  }
  
  metaTag.setAttribute('content', content);
}

// Watch for changes in props and update meta tags
watch(() => [props.title, props.description, props.imageUrl, props.url, props.satelliteName, props.homeLocation], 
  () => {
    updateMetaTags();
  }, 
  { deep: true }
);

// Update meta tags on component mount
onMounted(() => {
  updateMetaTags();
});
</script>

<template>
  <!-- This component doesn't render anything visible -->
</template> 