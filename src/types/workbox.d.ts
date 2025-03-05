declare interface WorkboxPlugin {
  handlerDidError?: (context: { request: Request }) => Promise<Response>;
}

interface CacheStorage {
  open(cacheName: string): Promise<Cache>;
}

declare var caches: CacheStorage; 