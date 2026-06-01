const SETTINGS_PREFIX = 'satgazer_';

export function saveSetting(key: string, value: unknown): void {
  localStorage.setItem(SETTINGS_PREFIX + key, JSON.stringify(value));
}

export function loadSetting<T>(key: string, defaultValue: T): T {
  const raw = localStorage.getItem(SETTINGS_PREFIX + key);
  if (raw === null) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function removeSetting(key: string): void {
  localStorage.removeItem(SETTINGS_PREFIX + key);
}
