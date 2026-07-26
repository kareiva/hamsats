import { test, expect } from '@playwright/test';
import { mockFixtureData, seedHomeLocation } from './helpers/mockData';

// Frozen a few hours after the fixture TLE epoch (day 206, 2026) so SGP4 propagation
// stays numerically well-behaved.
const FROZEN_TIME = new Date('2026-07-25T12:00:00Z');

test('a selected satellite moves as simulated time advances, and stops updating once deselected', async ({ page }) => {
  await mockFixtureData(page);
  await seedHomeLocation(page);
  await page.clock.install({ time: FROZEN_TIME });

  await page.goto('/?id=43017');

  const satelliteLine = page.locator('.status-item.satellite');
  await expect(satelliteLine).toBeVisible();
  await expect(satelliteLine).not.toContainText('Calculating...');

  const readingsAtT0 = await satelliteLine.innerText();

  // Advance the faked clock (not real time) so the app's real setInterval(...,1000)
  // position-update logic actually fires — real-time waits would not, since the page's
  // timers are frozen by page.clock.install().
  await page.clock.fastForward('00:00:15');

  await expect(satelliteLine).not.toHaveText(readingsAtT0);

  // Deselecting should remove the tracked-satellite readout entirely.
  await page.getByTitle('Clear selection').click();
  await expect(page.locator('.status-item.satellite')).toHaveCount(0);
  await expect(page.locator('.status-item', { hasText: 'None selected' })).toBeVisible();
});
