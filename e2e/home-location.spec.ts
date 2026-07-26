import { test, expect, type Page } from '@playwright/test';
import { mockFixtureData, seedHomeLocation } from './helpers/mockData';

const FROZEN_TIME = new Date('2026-07-25T12:00:00Z');

// Counts canvas pixels with non-zero alpha. The mocked basemap tile is fully transparent
// (see helpers/mockData.ts), so any non-zero alpha comes from something OpenLayers
// actually drew — this detects new feature rendering (like the home marker) without
// needing a dev-only hook or precise viewport-to-canvas coordinate mapping.
async function countPaintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('#map canvas') as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) count++;
    }
    return count;
  });
}

test('clearing home location does not move the map', async ({ page }) => {
  await mockFixtureData(page);
  await seedHomeLocation(page);
  await page.clock.install({ time: FROZEN_TIME });

  // Track every basemap tile request by zoom level. If the map view moved (panned or
  // zoomed), OpenLayers requests tiles for the new viewport; if it didn't, no new tile
  // requests happen at all. This avoids needing a dev-only hook into the map/view state.
  const requestedZooms: number[] = [];
  await page.route('https://*.basemaps.cartocdn.com/**', async route => {
    const match = new URL(route.request().url()).pathname.match(/\/light_all\/(\d+)\//);
    if (match) requestedZooms.push(Number(match[1]));
    await route.fallback();
  });

  await page.goto('/');

  // Let initial load and the home-location auto-fit (a 1000ms pan/zoom animation to frame
  // the sky satellites) fully settle before we start observing — otherwise trailing tile
  // requests from that animation's own tail end get misattributed to the clear action below.
  await expect(page.locator('.status-item.location')).toBeVisible();
  await expect(page.locator('.satellite-item').first()).toBeVisible();
  await page.waitForTimeout(2500);
  requestedZooms.length = 0;

  await page.getByText('Clear Home Location').click();
  await expect(page.locator('.status-item', { hasText: 'No home location set' })).toBeVisible();
  await page.waitForTimeout(1000);

  expect(requestedZooms).toEqual([]);
});

test('manually selecting a home location shows the home icon within 100ms', async ({ page }) => {
  await mockFixtureData(page);

  await page.goto('/');
  await expect(page.locator('#map canvas')).toBeVisible();

  const mapBox = await page.locator('#map').boundingBox();
  if (!mapBox) throw new Error('map bounding box not found');
  const tapX = mapBox.x + mapBox.width * 0.3;
  const tapY = mapBox.y + mapBox.height * 0.3;

  const pixelsBefore = await countPaintedPixels(page);

  await page.mouse.click(tapX, tapY);
  // OL's singleclick event has its own built-in debounce (to rule out a double-click)
  // before it ever fires — that's outside our app's control. Time from there, once the
  // app has actually registered the new home coordinates, to the marker being painted.
  await expect(page.getByText('Clear Home Location')).toBeVisible();

  const startTime = Date.now();
  let paintedWithinBudget = false;
  while (Date.now() - startTime < 1000) {
    if (await countPaintedPixels(page) > pixelsBefore) {
      paintedWithinBudget = Date.now() - startTime <= 100;
      break;
    }
  }

  expect(paintedWithinBudget).toBe(true);
});
