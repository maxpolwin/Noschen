const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '..', 'build', 'icon.svg');
const ICO_PATH = path.join(__dirname, '..', 'build', 'icon.ico');
const TEMP_DIR = path.join(__dirname, '..', 'build', 'temp-icons');

const SIZES = [256, 128, 64, 48, 32, 16];

// Simple ICO file creator
function createIco(pngBuffers) {
  // ICO header: 2 bytes reserved, 2 bytes type (1=ico), 2 bytes image count
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // Reserved
  header.writeUInt16LE(1, 2);      // Type: 1 = ICO
  header.writeUInt16LE(pngBuffers.length, 4); // Number of images

  // Calculate offsets
  const directorySize = 16 * pngBuffers.length;
  let offset = 6 + directorySize;

  // Create directory entries
  const directories = [];
  const sizes = [256, 128, 64, 48, 32, 16];

  for (let i = 0; i < pngBuffers.length; i++) {
    const dir = Buffer.alloc(16);
    const size = sizes[i];
    dir.writeUInt8(size === 256 ? 0 : size, 0);  // Width (0 = 256)
    dir.writeUInt8(size === 256 ? 0 : size, 1);  // Height (0 = 256)
    dir.writeUInt8(0, 2);                         // Color palette
    dir.writeUInt8(0, 3);                         // Reserved
    dir.writeUInt16LE(1, 4);                      // Color planes
    dir.writeUInt16LE(32, 6);                     // Bits per pixel
    dir.writeUInt32LE(pngBuffers[i].length, 8);  // Image size
    dir.writeUInt32LE(offset, 12);               // Image offset
    directories.push(dir);
    offset += pngBuffers[i].length;
  }

  // Combine all parts
  return Buffer.concat([header, ...directories, ...pngBuffers]);
}

async function generateWindowsIcon() {
  console.log('Generating Windows icon...');

  // Create temp directory
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Read SVG
  const svgBuffer = fs.readFileSync(SVG_PATH);

  // Generate PNGs at each size
  const pngBuffers = [];
  for (const size of SIZES) {
    const pngBuffer = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push(pngBuffer);
    console.log(`  Created ${size}x${size} PNG`);
  }

  // Convert to ICO
  const icoBuffer = createIco(pngBuffers);
  fs.writeFileSync(ICO_PATH, icoBuffer);
  console.log(`  Created icon.ico`);

  // Cleanup temp directory if it exists
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmdirSync(TEMP_DIR, { recursive: true });
  }

  console.log('Done! Icon saved to build/icon.ico');
}

generateWindowsIcon().catch(err => {
  console.error('Error generating icon:', err);
  process.exit(1);
});
