import Cookies from 'js-cookie';

const SETTINGS_PREFIX = 'satgazer_';
const COOKIE_EXPIRY = 30; // days

export function saveSetting(key: string, value: any) {
  Cookies.set(SETTINGS_PREFIX + key, JSON.stringify(value), { expires: COOKIE_EXPIRY });
}

export function loadSetting<T>(key: string, defaultValue: T): T {
  const value = Cookies.get(SETTINGS_PREFIX + key);
  if (value === undefined) return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
} 