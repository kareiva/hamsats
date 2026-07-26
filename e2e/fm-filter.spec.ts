import { test, expect } from '@playwright/test';
import { mockFixtureData, seedHomeLocation } from './helpers/mockData';

const FROZEN_TIME = new Date('2026-07-25T12:00:00Z');

test('Baofeng (FM) mode filters the sky panel to FM-capable fixture satellites only', async ({ page }) => {
  await mockFixtureData(page);
  await seedHomeLocation(page);
  await page.clock.install({ time: FROZEN_TIME });

  await page.goto('/');

  const panel = page.locator('.upcoming-satellites-control');
  await expect(panel).toBeVisible();
  await expect(page.locator('.satellite-item').first()).toBeVisible();

  await page.getByLabel(/baofeng/i).check();

  // The fixture's only non-FM satellite (AO-7 / OSCAR 7) must never appear once
  // filtering is on; ISS and RADFXSAT (FOX-1B), both FM-flagged, may.
  await expect(page.locator('.satellite-item', { hasText: 'OSCAR 7' })).toHaveCount(0);

  const names = await page.locator('.satellite-item .satellite-name').allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name).toMatch(/ISS|RADFXSAT/);
  }
});
