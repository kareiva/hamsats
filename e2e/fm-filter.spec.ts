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

test('Baofeng (FM) mode stays enabled across selecting and deselecting a satellite', async ({ page }) => {
  await mockFixtureData(page);
  await seedHomeLocation(page);
  await page.clock.install({ time: FROZEN_TIME });

  await page.goto('/');

  await page.getByLabel(/baofeng/i).check();
  await expect(page.locator('.satellite-item', { hasText: 'OSCAR 7' })).toHaveCount(0);

  // The Baofeng checkbox is hidden (not destroyed) while a satellite is selected — track
  // one, then deselect, and confirm the mode and its filtering both survive the round trip.
  await page.locator('.satellite-item .track-button').first().click();
  await expect(page.locator('.status-item.satellite')).not.toContainText('Calculating...');

  await page.getByTitle('Clear selection').click();

  await expect(page.getByLabel(/baofeng/i)).toBeChecked();
  await expect(page.locator('.satellite-item').first()).toBeVisible();
  await expect(page.locator('.satellite-item', { hasText: 'OSCAR 7' })).toHaveCount(0);
});
