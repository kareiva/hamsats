<template>
  <div class="social-share-control">
    <button @click="toggleShareMenu" class="share-button" title="Share">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"></circle>
        <circle cx="6" cy="12" r="3"></circle>
        <circle cx="18" cy="19" r="3"></circle>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
      </svg>
      Share
    </button>
    <div v-if="showShareMenu" class="share-menu">
      <div class="share-title">Share this view</div>
      <div class="share-options">
        <a :href="telegramShareUrl" target="_blank" rel="noopener" class="share-option telegram" title="Share on Telegram">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.293c-.145.658-.537.818-1.084.51l-3-2.21-1.446 1.394c-.14.18-.333.33-.683.33l.24-3.41 6.208-5.607c.268-.242-.06-.38-.42-.14l-7.672 4.83-3.308-1.033c-.72-.222-.734-.72.15-.106l12.933-4.984c.598-.222 1.122.146.95.724z"/>
          </svg>
          Telegram
        </a>
        <a :href="twitterShareUrl" target="_blank" rel="noopener" class="share-option twitter" title="Share on Twitter/X">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          Twitter/X
        </a>
        <a :href="mastodonShareUrl" target="_blank" rel="noopener" class="share-option mastodon" title="Share on Mastodon">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/>
          </svg>
          Mastodon
        </a>
        <a :href="facebookShareUrl" target="_blank" rel="noopener" class="share-option facebook" title="Share on Facebook">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Facebook
        </a>
      </div>
      <div class="share-url">
        <input type="text" readonly :value="currentUrl" ref="urlInput">
        <button @click="copyUrl" class="copy-button" :class="{ 'copied': copied }">
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  satelliteName?: string;
  satelliteId?: string;
  homeLocation?: { lat: number; lon: number } | null;
}>();

const showShareMenu = ref(false);
const urlInput = ref<HTMLInputElement | null>(null);
const copied = ref(false);
const baseUrl = 'https://www.hamsats.com';

const currentUrl = computed(() => {
  const url = new URL(baseUrl);
  const params = new URLSearchParams();
  
  if (props.satelliteId) {
    params.set('id', props.satelliteId);
  }
  
  if (props.homeLocation) {
    params.set('lat', props.homeLocation.lat.toFixed(6));
    params.set('lon', props.homeLocation.lon.toFixed(6));
  }
  
  const paramString = params.toString();
  if (paramString) {
    url.search = `?${paramString}`;
  }
  
  return url.toString();
});

const shareText = computed(() => {
  if (props.satelliteName) {
    return `Tracking ${props.satelliteName} satellite with HamSats`;
  }
  return 'Track amateur radio satellites in real-time with HamSats';
});

const telegramShareUrl = computed(() => {
  return `https://t.me/share/url?url=${encodeURIComponent(currentUrl.value)}&text=${encodeURIComponent(shareText.value)}`;
});

const twitterShareUrl = computed(() => {
  return `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl.value)}&text=${encodeURIComponent(shareText.value)}&via=LY2EN`;
});

const mastodonShareUrl = computed(() => {
  return `https://mastodon.radio/share?text=${encodeURIComponent(shareText.value + ' ' + currentUrl.value)}`;
});

const facebookShareUrl = computed(() => {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl.value)}`;
});

function toggleShareMenu() {
  showShareMenu.value = !showShareMenu.value;
}

function copyUrl() {
  if (urlInput.value) {
    urlInput.value.select();
    document.execCommand('copy');
    copied.value = true;
    
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.social-share-control')) {
    showShareMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style lang="scss" scoped>
.social-share-control {
  position: relative;
  margin-top: 10px;
  
  .share-button {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: rgba(255, 255, 255, 0.7);
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 14px;
    cursor: pointer;
    color: #333;
    
    &:hover {
      background-color: rgba(255, 255, 255, 0.9);
    }
    
    svg {
      color: #555;
    }
  }
  
  .share-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 5px;
    background-color: white;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    width: 250px;
    z-index: 1000;
    overflow: hidden;
    
    .share-title {
      padding: 10px;
      font-size: 14px;
      font-weight: 600;
      border-bottom: 1px solid #eee;
      text-align: center;
    }
    
    .share-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding: 10px;
      
      .share-option {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px;
        border-radius: 4px;
        text-decoration: none;
        color: white;
        font-size: 13px;
        
        &.telegram {
          background-color: #0088cc;
          
          &:hover {
            background-color: #0077b3;
          }
        }
        
        &.twitter {
          background-color: #1da1f2;
          
          &:hover {
            background-color: #0d8ecf;
          }
        }
        
        &.mastodon {
          background-color: #6364ff;
          
          &:hover {
            background-color: #5253e3;
          }
        }
        
        &.facebook {
          background-color: #1877f2;
          
          &:hover {
            background-color: #0d65d9;
          }
        }
      }
    }
    
    .share-url {
      display: flex;
      padding: 10px;
      border-top: 1px solid #eee;
      
      input {
        flex: 1;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px 0 0 4px;
        font-size: 12px;
      }
      
      .copy-button {
        background-color: #f0f0f0;
        border: 1px solid #ddd;
        border-left: none;
        border-radius: 0 4px 4px 0;
        padding: 0 10px;
        cursor: pointer;
        font-size: 12px;
        
        &:hover {
          background-color: #e0e0e0;
        }
        
        &.copied {
          background-color: #4caf50;
          color: white;
          border-color: #4caf50;
        }
      }
    }
  }
}

@media (max-width: 640px) {
  .social-share-control {
    .share-menu {
      width: 100%;
      max-width: calc(100vw - 20px);
      right: auto;
      left: 0;
    }
  }
}
</style> 