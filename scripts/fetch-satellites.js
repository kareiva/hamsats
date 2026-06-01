const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle';
const OUTPUT = path.join(__dirname, '../public/amateur.txt');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log(`Fetching TLE data from Celestrak...`);
  const data = await fetch(URL);

  const lines = data.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const count = Math.floor(lines.length / 3);
  if (count === 0) {
    throw new Error('Response contained no TLE records');
  }

  fs.writeFileSync(OUTPUT, data);
  console.log(`Wrote ${count} satellites to ${path.relative(process.cwd(), OUTPUT)}`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
