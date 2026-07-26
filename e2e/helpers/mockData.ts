import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

const amateurFixture = fs.readFileSync(path.join(FIXTURES_DIR, 'amateur-fixture.txt'), 'utf8');
const fmSatellitesFixture = fs.readFileSync(path.join(FIXTURES_DIR, 'fm-satellites-fixture.json'), 'utf8');

// A 1x1 transparent PNG, served for every basemap tile request so the map background is
// instant and pixel-identical on every run — real tile loading is both slow and
// non-deterministic (varies with network timing), which makes screenshot tests flaky.
const BLANK_TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

// Intercepts every network call the app makes for satellite/transmitter/elevation data
// and serves fixed fixtures instead, so tests are independent of live TLE data, the
// SatNOGS/AMSAT catalog, and network availability inside the container.
export async function mockFixtureData(page: Page) {
  await page.route('https://celestrak.org/NORAD/elements/gp.php**', route =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: amateurFixture })
  );

  await page.route('**/amateur.txt', route =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: amateurFixture })
  );

  await page.route('**/fm-satellites.json', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: fmSatellitesFixture })
  );

  await page.route('**/transponders/*.json', async route => {
    const catalogNumber = route.request().url().split('/').pop()!.replace('.json', '');
    const fixturePath = path.join(FIXTURES_DIR, 'transponders', `${catalogNumber}.json`);
    if (fs.existsSync(fixturePath)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(fixturePath, 'utf8') });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });

  await page.route('https://api.open-elevation.com/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [{ elevation: 150 }] })
    })
  );

  await page.route('https://*.basemaps.cartocdn.com/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: BLANK_TILE_PNG
    })
  );
}

// Seeds a fixed home location before the app's first script runs, so tests don't depend
// on geolocation or a map click.
export async function seedHomeLocation(page: Page, lat = 54.687157, lon = 25.279652) {
  await page.addInitScript(({ lat, lon }) => {
    localStorage.setItem('satgazer_homeLocation', JSON.stringify({ lat, lon }));
  }, { lat, lon });
}
