#!/usr/bin/env node
/**
 * 1. Rebuilds manifest.json from the actual files on disk.
 * 2. Rewrites helmgast.se/asset/(download|link)/ URLs in all markdown files
 *    to the new GCS-style URL: https://files.helmgast.se/<world>/<filename>
 *
 * The mapping from old URL → new path is derived from:
 *   a) The current manifest.json (for files already downloaded)
 *   b) Direct filename match in the downloads/files tree
 *
 * Gated files (returning 401) are left unchanged.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = path.join(__dirname, '..', 'src', 'content');
const FILES_DIR = path.join(__dirname, 'downloads', 'files');
const MANIFEST_PATH = path.join(__dirname, 'downloads', 'manifest.json');
const GCS_BASE = 'https://files.helmgast.se';

const FILE_URL_RE = /https?:\/\/helmgast\.se\/asset\/(?:download|link)\/[^\s)"'<\]]+/g;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp|tiff?)(\?.*)?$/i;

// --- Rebuild manifest from files on disk ---
function scanFiles(dir, base = '') {
    const result = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            Object.assign(result, scanFiles(path.join(dir, entry.name), rel));
        } else {
            result[entry.name] = rel; // filename → relative path
        }
    }
    return result;
}

const filesByName = scanFiles(FILES_DIR); // e.g. { "arvtagaren.pdf": "eon/arvtagaren.pdf" }

// Load existing manifest
const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : {};

// --- Build url → new GCS URL map ---
function resolveNewUrl(url) {
    const urlPath = new URL(url).pathname
        .replace(/^\/asset\/(download|link)\//, '');
    const filename = urlPath.split('/').pop();

    // Check manifest first (most accurate)
    if (manifest[url]) {
        return `${GCS_BASE}/${manifest[url]}`;
    }

    // Check if file exists under the url's own subpath
    const bySubpath = path.join(FILES_DIR, urlPath);
    if (fs.existsSync(bySubpath)) {
        return `${GCS_BASE}/${urlPath}`;
    }

    // Fallback: find by filename anywhere in the tree
    if (filesByName[filename]) {
        return `${GCS_BASE}/${filesByName[filename]}`;
    }

    return null; // can't resolve — leave unchanged
}

// --- Update manifest with newly resolved paths ---
// Collect all URLs from content
const allUrls = new Set();
function collectUrls(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectUrls(full);
        else if (entry.name.endsWith('.md')) {
            const content = fs.readFileSync(full, 'utf8');
            for (const match of content.matchAll(FILE_URL_RE)) {
                const url = match[0].replace(/[)\]'"]+$/, '');
                if (!IMAGE_EXT.test(url)) allUrls.add(url);
            }
        }
    }
}
collectUrls(CONTENT_ROOT);

// Update manifest for any URL not already there
let manifestUpdates = 0;
for (const url of allUrls) {
    const newUrl = resolveNewUrl(url);
    if (newUrl) {
        const relPath = newUrl.replace(`${GCS_BASE}/`, '');
        if (manifest[url] !== relPath) {
            manifest[url] = relPath;
            manifestUpdates++;
        }
    }
}
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`Manifest: ${Object.keys(manifest).length} entries (${manifestUpdates} updated)`);

// --- Rewrite markdown files ---
let filesChanged = 0, urlsReplaced = 0, urlsSkipped = 0;

function rewriteFile(filePath) {
    const original = fs.readFileSync(filePath, 'utf8');
    let updated = original;
    let fileReplaced = 0;

    for (const match of original.matchAll(FILE_URL_RE)) {
        const oldUrl = match[0].replace(/[)\]'"]+$/, '');
        if (IMAGE_EXT.test(oldUrl)) continue;

        const newUrl = resolveNewUrl(oldUrl);
        if (!newUrl) {
            console.log(`  ⚠ no local file for: ${oldUrl}`);
            urlsSkipped++;
            continue;
        }

        // Replace all occurrences of this URL (without trailing punctuation variants)
        const escaped = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(escaped, 'g');
        const before = updated;
        updated = updated.replace(re, newUrl);
        if (updated !== before) fileReplaced++;
    }

    if (updated !== original) {
        fs.writeFileSync(filePath, updated);
        filesChanged++;
        urlsReplaced += fileReplaced;
        console.log(`  ✓ ${path.relative(CONTENT_ROOT, filePath)} (${fileReplaced} URLs)`);
    }
}

function rewriteAll(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) rewriteAll(full);
        else if (entry.name.endsWith('.md')) rewriteFile(full);
    }
}

console.log('\nRewriting article URLs...');
rewriteAll(CONTENT_ROOT);

console.log(`\n=== Summary ===`);
console.log(`Files changed:   ${filesChanged}`);
console.log(`URLs replaced:   ${urlsReplaced}`);
console.log(`URLs skipped:    ${urlsSkipped} (no local file — left unchanged)`);
