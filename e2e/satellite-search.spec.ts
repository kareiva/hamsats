import { test, expect } from '@playwright/test';
import { mockFixtureData, seedHomeLocation } from './helpers/mockData';

const FROZEN_TIME = new Date('2026-07-25T12:00:00Z');

test('searching for a satellite by name selects it', async ({ page }) => {
  await mockFixtureData(page);
  await seedHomeLocation(page);
  await page.clock.install({ time: FROZEN_TIME });

  await page.goto('/');

  const searchInput = page.locator('.search-input');
  await searchInput.click();
  await searchInput.fill('RADFXSAT');

  const match = page.locator('.autocomplete-item', { hasText: 'RADFXSAT' });
  await expect(match).toBeVisible();
  await match.click();

  await expect(page).toHaveURL(/id=43017/);
  await expect(page.locator('.status-item.satellite')).not.toContainText('Calculating...');
  await expect(searchInput).toHaveValue(/RADFXSAT/);
});
