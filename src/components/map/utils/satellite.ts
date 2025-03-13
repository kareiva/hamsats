import { getLatLngObj, getSatelliteInfo } from 'tle.js';

export { getLatLngObj, getSatelliteInfo };

export function extractCatalogNumber(tle1: string): string | undefined {
  const match = tle1.match(/^\d{1}\s+(\d+)/);
  return match ? match[1] : undefined;
} 