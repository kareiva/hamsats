const fs = require('fs');
const path = require('path');
const https = require('https');

// Function to read the amateur.txt file and extract catalog numbers
function extractCatalogNumbers(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n');
  const catalogNumbers = [];

  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 < lines.length) {
      const line1 = lines[i + 1].trim();
      
      if (line1 && line1.startsWith('1 ')) {
        // Catalog number is in positions 3-7 (0-indexed)
        const catalogNumber = line1.substring(2, 7).trim();
        if (catalogNumber) {
          catalogNumbers.push(catalogNumber);
        }
      }
    }
  }

  return catalogNumbers;
}

// Function to fetch transmitter data for a satellite
function fetchTransmitterData(catalogNumber) {
  return new Promise((resolve, reject) => {
    const url = `https://db.satnogs.org/api/transmitters/?alive=true&format=json&satellite__norad_cat_id=${catalogNumber}`;
    
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch data for satellite ${catalogNumber}: ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const transmitters = JSON.parse(data);
          resolve(transmitters);
        } catch (error) {
          reject(new Error(`Failed to parse data for satellite ${catalogNumber}: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Request error for satellite ${catalogNumber}: ${error.message}`));
    });
  });
}

// Function to save transmitter data to a file
function saveTransmitterData(catalogNumber, data) {
  const outputDir = path.join(__dirname, '../public/transponders');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, `${catalogNumber}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Main function to process all satellites
async function main() {
  const amateurFilePath = path.join(__dirname, '../public/amateur.txt');
  const catalogNumbers = extractCatalogNumbers(amateurFilePath);
  
  console.log(`Found ${catalogNumbers.length} satellites in amateur.txt`);
  
  // Create a manifest file with all catalog numbers
  const manifestPath = path.join(__dirname, '../public/transponders/manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(catalogNumbers, null, 2));
  
  // Process satellites with a delay to avoid rate limiting
  let processed = 0;
  let errors = 0;
  
  for (const catalogNumber of catalogNumbers) {
    try {
      console.log(`Fetching data for satellite ${catalogNumber} (${processed + 1}/${catalogNumbers.length})...`);
      const data = await fetchTransmitterData(catalogNumber);
      
      if (data && data.length > 0) {
        saveTransmitterData(catalogNumber, data);
        console.log(`✓ Saved ${data.length} transmitters for satellite ${catalogNumber}`);
      } else {
        console.log(`✓ No transmitters found for satellite ${catalogNumber}`);
        // Save empty array to indicate we checked this satellite
        saveTransmitterData(catalogNumber, []);
      }
      
      // Add a delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
      processed++;
    } catch (error) {
      console.error(`✗ Error processing satellite ${catalogNumber}:`, error.message);
      errors++;
    }
  }
  
  console.log(`\nCompleted processing ${catalogNumbers.length} satellites.`);
  console.log(`Successfully processed: ${processed}`);
  console.log(`Errors: ${errors}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 