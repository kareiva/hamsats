import { test, expect } from '@playwright/test';
import { mockFixtureData, seedHomeLocation } from './helpers/mockData';

const FROZEN_TIME = new Date('2026-07-25T12:00:00Z');

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
