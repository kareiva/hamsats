const fs = require('fs');
const path = require('path');

function generateRobotsTxt(baseUrl) {
  let content = 'User-agent: *\n';
  content += 'Allow: /\n\n';
  content += `Sitemap: ${baseUrl}sitemap.xml\n`;
  return content;
}

function main() {
  const baseUrl = 'https://www.hamsats.com/';
  const robotsPath = path.join(__dirname, '../public/robots.txt');
  
  console.log('Generating robots.txt...');
  const robotsTxt = generateRobotsTxt(baseUrl);
  
  fs.writeFileSync(robotsPath, robotsTxt);
  console.log(`robots.txt generated at ${robotsPath}`);
}

main(); 