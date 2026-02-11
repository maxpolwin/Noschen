#!/usr/bin/env node

/**
 * nest-llama-deps.js
 *
 * Pre-packaging script that copies hoisted transitive dependencies into
 * node_modules/node-llama-cpp/node_modules/ so they are captured by
 * electron-builder's asarUnpack glob and available at runtime.
 *
 * Usage:
 *   node scripts/nest-llama-deps.js            # Copy hoisted deps
 *   node scripts/nest-llama-deps.js --cleanup   # Remove previously copied deps
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROOT_NM = path.join(ROOT, 'node_modules');
const NLC_DIR = path.join(ROOT_NM, 'node-llama-cpp');
const NLC_NM = path.join(NLC_DIR, 'node_modules');
const MANIFEST_PATH = path.join(NLC_NM, '.nested-deps-manifest.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(srcPath);
      try { fs.symlinkSync(target, destPath); } catch { /* ignore */ }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function rmDirSync(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function getDeps(pkgDir) {
  const pkgPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.dependencies || {};
  } catch {
    return {};
  }
}

// ── Nesting logic ────────────────────────────────────────────────────────────

function nestDeps(targetNM, deps, visited, copiedList) {
  for (const dep of Object.keys(deps)) {
    if (visited.has(dep)) continue;
    visited.add(dep);

    const nestedPath = path.join(targetNM, dep);
    const hoistedPath = path.join(ROOT_NM, dep);

    // Already nested (installed there by npm due to version conflict) – just recurse
    if (fs.existsSync(nestedPath)) {
      const subDeps = getDeps(nestedPath);
      nestDeps(targetNM, subDeps, visited, copiedList);
      continue;
    }

    // Not nested and not hoisted – optional dep not installed, skip
    if (!fs.existsSync(hoistedPath)) continue;

    // Copy from hoisted location into nested location
    console.log(`  Nesting: ${dep}`);
    copyDirSync(hoistedPath, nestedPath);
    copiedList.push(dep);

    // Recurse into this package's own dependencies
    const subDeps = getDeps(nestedPath);
    nestDeps(targetNM, subDeps, visited, copiedList);
  }
}

// ── Cleanup logic ────────────────────────────────────────────────────────────

function cleanup() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log('No manifest found, nothing to clean up.');
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    console.log('Could not read manifest, nothing to clean up.');
    return;
  }

  console.log(`Cleaning up ${manifest.length} nested dependencies...`);
  for (const dep of manifest) {
    const nestedPath = path.join(NLC_NM, dep);
    if (fs.existsSync(nestedPath)) {
      rmDirSync(nestedPath);
      console.log(`  Removed: ${dep}`);
    }
  }

  fs.unlinkSync(MANIFEST_PATH);
  console.log('Cleanup done.');
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const isCleanup = process.argv.includes('--cleanup');

  if (isCleanup) {
    cleanup();
    return;
  }

  if (!fs.existsSync(NLC_DIR)) {
    console.error('node-llama-cpp not found. Run npm install first.');
    process.exit(1);
  }

  console.log('Nesting hoisted dependencies for node-llama-cpp...');
  fs.mkdirSync(NLC_NM, { recursive: true });

  const visited = new Set();
  const copiedList = [];

  const nlcDeps = getDeps(NLC_DIR);
  nestDeps(NLC_NM, nlcDeps, visited, copiedList);

  if (copiedList.length === 0) {
    console.log('All dependencies already nested. Nothing to do.');
  } else {
    // Write manifest so --cleanup knows what to remove
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(copiedList, null, 2));
    console.log(`Done. Nested ${copiedList.length} packages.`);
  }
}

main();
