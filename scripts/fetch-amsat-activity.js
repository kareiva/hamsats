const fs = require('fs');
const path = require('path');
const https = require('https');

const STATUS_URL = 'https://amsat.org/status/';
const FM_URL = 'https://www.amsat.org/live-fm-satellites/';
const TOP_ACTIVE_COUNT = 5;
const OUTPUT = path.join(__dirname, '../public/amsat-activity.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Locates the activity-heatmap table on the AMSAT status page (one row per satellite,
// each cell color-coded by report status for a 12-slot-per-day x 6-day window).
function extractStatusTable(html) {
  const startMarker = '<table border=0 cellspacing=1 cellpadding=0><tr>';
  const start = html.indexOf(startMarker);
  if (start === -1) throw new Error('Could not locate status table on ' + STATUS_URL);
  const end = html.indexOf('</table>', start);
  if (end === -1) throw new Error('Could not find end of status table on ' + STATUS_URL);
  return html.slice(start, end);
}

function parseStatusRows(tableHtml) {
  // Split on <tr> opening tags rather than matching <tr>...</tr> pairs — the page has
  // at least one row with a missing closing </tr>, which would corrupt a naive regex match.
  const rows = tableHtml.split(/<tr>/i).slice(1); // first chunk is pre-<tr> cruft
  const results = [];

  for (const row of rows) {
    const nameMatch = row.match(/<td align="right"><a[^>]*>([^<]+)<\/a><\/td>/);
    if (!nameMatch) continue; // header/legend row, skip

    const id = nameMatch[1].trim();

    // Sum reports in "Sat/Mode Active" (#648fff) cells as an activity score
    const activeCells = row.match(/bgcolor="#648fff"[^>]*>\s*<a[^>]*>(\d+)<\/a>/g) || [];
    const activityScore = activeCells.reduce((sum, cell) => {
      const n = cell.match(/>(\d+)<\/a>/);
      return sum + (n ? parseInt(n[1], 10) : 0);
    }, 0);

    results.push({ id, activityScore, activeCellCount: activeCells.length });
  }

  return results;
}

// Locates the static "supported FM satellites" reference table (Satellite/Uplink/
// Downlink/Comment columns) on the live-fm-satellites page.
function extractFmTable(html) {
  const marker = '<table class="has-contrast-3-background-color has-background">';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('Could not locate FM satellites table on ' + FM_URL);
  const end = html.indexOf('</table>', start);
  if (end === -1) throw new Error('Could not find end of FM satellites table on ' + FM_URL);
  return html.slice(start, end);
}

function parseFmRows(tableHtml) {
  const bodyStart = tableHtml.indexOf('<tbody>');
  const body = bodyStart === -1 ? tableHtml : tableHtml.slice(bodyStart);
  const rows = body.split(/<tr>/i).slice(1);

  const results = [];
  for (const row of rows) {
    const firstCellMatch = row.match(/<td[^>]*>(.*?)<\/td>/);
    if (!firstCellMatch) continue;
    // Strip tags, collapse <br> into a separator, to get plain designator text
    const text = firstCellMatch[1]
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) results.push(text);
  }
  return results;
}

async function main() {
  console.log(`Fetching satellite activity from ${STATUS_URL}...`);
  const statusHtml = await fetch(STATUS_URL);
  const statusRows = parseStatusRows(extractStatusTable(statusHtml));
  if (statusRows.length === 0) {
    throw new Error('Parsed 0 rows from the status table — page layout may have changed');
  }
  console.log(`Parsed ${statusRows.length} satellites from the status table`);

  const topActive = [...statusRows]
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, TOP_ACTIVE_COUNT);

  console.log(`Fetching FM satellite list from ${FM_URL}...`);
  const fmHtml = await fetch(FM_URL);
  const fmSatellites = parseFmRows(extractFmTable(fmHtml));
  if (fmSatellites.length === 0) {
    throw new Error('Parsed 0 rows from the FM satellites table — page layout may have changed');
  }
  console.log(`Parsed ${fmSatellites.length} satellites from the FM satellites table`);

  const output = {
    generatedAt: new Date().toISOString(),
    topActive,
    fmSatellites,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
