const fs = require('fs');
const path = require('path');

function main() {
  const headerBarPath = path.join(__dirname, '../src/components/map/HeaderBar.vue');
  const today = new Date().toISOString().slice(0, 10);

  console.log('Bumping version date in HeaderBar.vue...');
  const content = fs.readFileSync(headerBarPath, 'utf8');
  const versionPattern = /v\d{4}-\d{2}-\d{2}/;

  if (!versionPattern.test(content)) {
    console.error('No version string (vYYYY-MM-DD) found in HeaderBar.vue');
    process.exit(1);
  }

  const updated = content.replace(versionPattern, `v${today}`);
  if (updated === content) {
    console.log(`Version already at v${today}`);
    return;
  }

  fs.writeFileSync(headerBarPath, updated);
  console.log(`Version bumped to v${today}`);
}

main();
