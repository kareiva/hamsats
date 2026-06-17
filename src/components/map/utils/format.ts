// Format a distance in km as "1 234 km" (no decimal, narrow-space thousands separator)
export function formatDistance(km: number): string {
  const n = Math.round(km);
  if (n >= 1000) {
    return `${Math.floor(n / 1000)} ${String(n % 1000).padStart(3, '0')} km`;
  }
  return `${n} km`;
}
