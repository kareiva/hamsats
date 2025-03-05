const fs = require('fs');
const path = require('path');

// Function to read the amateur.txt file and extract satellite data
function extractSatelliteData(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n');
  const satellites = [];

  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 < lines.length) {
      const name = lines[i].trim();
      const line1 = lines[i + 1].trim();
      
      if (name && line1 && line1.startsWith('1 ')) {
        // Catalog number is in positions 3-7 (0-indexed)
        const catalogNumber = line1.substring(2, 7).trim();
        if (catalogNumber) {
          satellites.push({
            name: name,
            catalogNumber: catalogNumber
          });
        }
      }
    }
  }

  return satellites;
}

// Function to generate sitemap XML
function generateSitemap(satellites, baseUrl) {
  const today = new Date().toISOString().split('T')[0];
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Add homepage
  xml += '  <url>\n';
  xml += `    <loc>${baseUrl}</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';
  
  // Add satellite pages
  satellites.forEach(satellite => {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}?id=${satellite.catalogNumber}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';
    xml += '  </url>\n';
  });
  
  xml += '</urlset>';
  return xml;
}

// Main function
function main() {
  const baseUrl = 'https://www.hamsats.com/';
  const amateurFilePath = path.join(__dirname, '../public/amateur.txt');
  const sitemapPath = path.join(__dirname, '../public/sitemap.xml');
  
  console.log('Extracting satellite data...');
  const satellites = extractSatelliteData(amateurFilePath);
  console.log(`Found ${satellites.length} satellites`);
  
  console.log('Generating sitemap...');
  const sitemap = generateSitemap(satellites, baseUrl);
  
  fs.writeFileSync(sitemapPath, sitemap);
  console.log(`Sitemap generated at ${sitemapPath}`);
}

main();