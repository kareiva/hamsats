import { test, expect } from '@playwright/test';
import { mockFixtureData, seedHomeLocation } from './helpers/mockData';

const FROZEN_TIME = new Date('2026-07-25T12:00:00Z');

test('Transponder-type transmitters are shown above other types', async ({ page }) => {
  await mockFixtureData(page);
  await seedHomeLocation(page);
  await page.clock.install({ time: FROZEN_TIME });

  // Fixture (e2e/fixtures/transponders/07530.json) lists them in the order
  // Transmitter, Transponder, Transmitter — deliberately not already sorted.
  await page.goto('/?id=07530');
  await expect(page.locator('.status-item.satellite')).not.toContainText('Calculating...');

  const descriptions = await page.locator('.transmitter-item .transmitter-description').allInnerTexts();

  expect(descriptions).toEqual([
    'Mode V/A (A) Lin SSB',  // the only Transponder-type entry — sorted first
    'Mode U TLM Beacon',     // remaining Transmitter-type entries, original order preserved
    '13 cm Beacon (40mW)'
  ]);
});
