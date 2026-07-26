import { test, expect } from '@playwright/test';
import { mockFixtureData, seedHomeLocation } from './helpers/mockData';

const FROZEN_TIME = new Date('2026-07-25T12:00:00Z');

// Counts canvas pixels with non-zero alpha. The mocked basemap tile is fully transparent
// (see helpers/mockData.ts), so any non-zero alpha comes from something OpenLayers
// actually drew (satellite icon, horizon circle, line-of-sight, path). Comparing this
// count within a single browser session (before vs after toggling the path) avoids the
// cross-run baseline drift that made screenshot-diffing here flaky — no baseline image,
// no anti-aliasing tolerance, no dev-only app hook required.
async function countPaintedPixels(page: import('@playwright/test').Page): Promise<number> {
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

test('enabling "show future path" draws additional features on the map', async ({ page }) => {
  await mockFixtureData(page);
  await seedHomeLocation(page);
  await page.clock.install({ time: FROZEN_TIME });

  await page.goto('/?id=43017');

  // Wait, in real time, for the app's own async init (mocked network fetches, elevation
  // lookup, satellite selection) to actually finish before touching the faked clock.
  await expect(page.locator('.status-item.satellite')).not.toContainText('Calculating...');

  // Let the initial view-fit animation (1000ms duration) and satellite placement settle
  // before sampling. Real-time waits would not help here since the page's timers/rAF are
  // frozen by page.clock.install() — only advancing the faked clock drives OL's redraw.
  await page.clock.fastForward('00:00:02');
  const pixelsBefore = await countPaintedPixels(page);
  expect(pixelsBefore).toBeGreaterThan(0); // sanity check: the satellite/home markers are drawn

  await page.getByLabel('Show future path').check();
  await page.clock.fastForward('00:00:02');

  const pixelsAfter = await countPaintedPixels(page);
  expect(pixelsAfter).toBeGreaterThan(pixelsBefore);
});
