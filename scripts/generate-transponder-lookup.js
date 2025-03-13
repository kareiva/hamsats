const fs = require('fs');
const path = require('path');

// Read all transponder files
const transpondersDir = path.join(__dirname, '../public/transponders');
const files = fs.readdirSync(transpondersDir)
  .filter(file => file.endsWith('.json') && file !== 'manifest.json');

const fmLookup = {};

// Process each file
files.forEach(file => {
  const catalogNumber = path.basename(file, '.json');
  const data = JSON.parse(fs.readFileSync(path.join(transpondersDir, file), 'utf8'));
  
  // Check if any transponder has FM capability
  const hasFM = data.some(tx => 
    tx.alive && (
      (tx.mode && tx.mode.includes('FM')) || 
      (tx.uplink_mode && tx.uplink_mode.includes('FM'))
    )
  );
  
  fmLookup[catalogNumber] = hasFM;
});

// Write the lookup file
fs.writeFileSync(
  path.join(__dirname, '../public/fm-satellites.json'),
  JSON.stringify(fmLookup, null, 2)
);

console.log('Generated FM satellite lookup file'); 