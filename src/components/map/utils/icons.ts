function svgDataUri(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Lucide satellite icon — https://lucide.dev/icons/satellite
export function satelliteIconUri(color: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5"/>` +
    `<path d="M16.5 7.5 19 5"/>` +
    `<path d="m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5"/>` +
    `<path d="M9 21a6 6 0 0 0-6-6"/>` +
    `<path d="M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z"/>` +
    `</svg>`
  );
}

// Lucide satellite-dish icon — https://lucide.dev/icons/satellite-dish (ground station)
export function dishIconUri(color: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M4 10a7.31 7.31 0 0 0 10 10Z"/>` +
    `<path d="m9 15 3-3"/>` +
    `<path d="M17 13a6 6 0 0 0-6-6"/>` +
    `<path d="M21 13A10 10 0 0 0 11 3"/>` +
    `</svg>`
  );
}

// Direction arrow — points north at rotation=0, rotate to satellite bearing
export function arrowIconUri(color: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<polygon points="12,2 18,20 12,16 6,20" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

// Returns bearing in radians (0 = north, clockwise) — maps directly to OL Icon rotation
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const lat1r = lat1 * Math.PI / 180;
  const lat2r = lat2 * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return Math.atan2(y, x);
}
