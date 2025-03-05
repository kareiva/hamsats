import Cookies from 'js-cookie';

const SETTINGS_PREFIX = 'satgazer_';
const COOKIE_EXPIRY = 30; // days
const CHUNK_SIZE = 4096; // bytes

export function saveSetting(key: string, value: any) {
  const stringValue = JSON.stringify(value);
  
  // If value is small enough, save directly
  if (stringValue.length <= CHUNK_SIZE) {
    Cookies.set(SETTINGS_PREFIX + key, stringValue, { expires: COOKIE_EXPIRY });
    return;
  }

  // Split into chunks
  const chunks = Math.ceil(stringValue.length / CHUNK_SIZE);
  for (let i = 0; i < chunks; i++) {
    const chunk = stringValue.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    Cookies.set(`${SETTINGS_PREFIX}${key}_${i}`, chunk, { expires: COOKIE_EXPIRY });
  }
  // Save chunk count
  Cookies.set(`${SETTINGS_PREFIX}${key}_chunks`, chunks.toString(), { expires: COOKIE_EXPIRY });
}

export function loadSetting<T>(key: string, defaultValue: T): T {
  // Check if this is a chunked value
  const chunksStr = Cookies.get(`${SETTINGS_PREFIX}${key}_chunks`);
  
  if (!chunksStr) {
    // Regular single cookie
    const value = Cookies.get(SETTINGS_PREFIX + key);
    if (value === undefined) return defaultValue;
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }

  // Combine chunks
  try {
    const chunks = parseInt(chunksStr);
    let combinedValue = '';
    
    for (let i = 0; i < chunks; i++) {
      const chunk = Cookies.get(`${SETTINGS_PREFIX}${key}_${i}`);
      if (chunk === undefined) {
        throw new Error('Missing chunk');
      }
      combinedValue += chunk;
    }
    
    return JSON.parse(combinedValue);
  } catch {
    return defaultValue;
  }
}

export function removeSetting(key: string) {
  // Check if this is a chunked value
  const chunksStr = Cookies.get(`${SETTINGS_PREFIX}${key}_chunks`);
  
  if (!chunksStr) {
    // Regular single cookie
    Cookies.remove(SETTINGS_PREFIX + key);
    return;
  }

  // Remove all chunks
  const chunks = parseInt(chunksStr);
  for (let i = 0; i < chunks; i++) {
    Cookies.remove(`${SETTINGS_PREFIX}${key}_${i}`);
  }
  Cookies.remove(`${SETTINGS_PREFIX}${key}_chunks`);
} 