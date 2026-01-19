#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Qwen2.5-0.5B-Instruct GGUF model from Hugging Face
const MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';
const MODEL_FILENAME = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
const MODELS_DIR = path.join(__dirname, '..', 'models');
const MODEL_PATH = path.join(MODELS_DIR, MODEL_FILENAME);

// Expected file size (approximately 400MB)
const EXPECTED_SIZE_MB = 400;

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log('Downloading Qwen2.5-0.5B model...');
    console.log(`URL: ${url}`);
    console.log(`Destination: ${dest}`);
    console.log('');

    // Ensure models directory exists
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
    }

    const file = fs.createWriteStream(dest);
    let downloadedBytes = 0;
    let totalBytes = 0;
    let lastPercent = 0;

    const request = (currentUrl) => {
      https.get(currentUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          console.log(`Following redirect to: ${redirectUrl}`);
          request(redirectUrl);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        if (totalBytes > 0) {
          console.log(`File size: ${formatBytes(totalBytes)}`);
        }
        console.log('');

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.floor((downloadedBytes / totalBytes) * 100) : 0;

          // Update progress every 5%
          if (percent >= lastPercent + 5 || percent === 100) {
            lastPercent = percent;
            const progress = totalBytes > 0
              ? `${percent}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`
              : formatBytes(downloadedBytes);
            process.stdout.write(`\rDownloading: ${progress}`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('\n\nDownload complete!');
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(dest, () => {}); // Delete incomplete file
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {}); // Delete incomplete file
        reject(err);
      });
    };

    request(url);
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log('Noschen - Model Download Script');
  console.log('='.repeat(50));
  console.log('');

  // Check if model already exists
  if (fs.existsSync(MODEL_PATH)) {
    const stats = fs.statSync(MODEL_PATH);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB > EXPECTED_SIZE_MB * 0.9) {
      console.log(`Model already exists: ${MODEL_PATH}`);
      console.log(`Size: ${formatBytes(stats.size)}`);
      console.log('');
      console.log('To re-download, delete the file and run this script again.');
      return;
    } else {
      console.log('Existing model file appears incomplete. Re-downloading...');
      fs.unlinkSync(MODEL_PATH);
    }
  }

  try {
    await downloadFile(MODEL_URL, MODEL_PATH);

    // Verify the download
    const stats = fs.statSync(MODEL_PATH);
    console.log(`Downloaded file size: ${formatBytes(stats.size)}`);

    if (stats.size < EXPECTED_SIZE_MB * 0.9 * 1024 * 1024) {
      console.warn('Warning: Downloaded file may be incomplete.');
    } else {
      console.log('');
      console.log('Model downloaded successfully!');
      console.log('You can now run the app with: npm run dev');
    }
  } catch (error) {
    console.error('');
    console.error('Download failed:', error.message);
    console.error('');
    console.error('You can manually download the model from:');
    console.error(MODEL_URL);
    console.error('');
    console.error(`And place it in: ${MODELS_DIR}`);
    process.exit(1);
  }
}

main();
