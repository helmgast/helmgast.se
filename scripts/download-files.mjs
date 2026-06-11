#!/usr/bin/env node
/**
 * Downloads the public file assets (PDFs, ZIPs, etc.) referenced in article
 * markdown from helmgast.se into a local staging directory.
 *
 * Output: scripts/downloads/files/<slug>
 * Manifest: scripts/downloads/manifest.json  (url → local path, for GCS upload + link rewriting)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = path.join(__dirname, '..', 'src', 'content');
const OUT_DIR = path.join(__dirname, 'downloads', 'files');
const MANIFEST_PATH = path.join(__dirname, 'downloads', 'manifest.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Collect all non-image file URLs from content ---
const FILE_URL_RE = /https?:\/\/helmgast\.se\/asset\/(?:download|link)\/[^\s)"'<\]]+/g;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp|tiff?)(\?.*)?$/i;

function collectUrls(dir) {
    const urls = new Set();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectUrls(full).forEach(u => urls.add(u));
        } else if (entry.name.endsWith('.md')) {
            const content = fs.readFileSync(full, 'utf8');
            for (const match of content.matchAll(FILE_URL_RE)) {
                const url = match[0].replace(/[)\]'"]+$/, ''); // strip trailing punctuation
                if (!IMAGE_EXT.test(url)) urls.add(url);
            }
        }
    }
    return urls;
}

const urls = [...collectUrls(CONTENT_ROOT)].sort();
console.log(`Found ${urls.length} file URLs\n`);

// --- Download helper ---
function download(url, destPath, redirectsLeft = 5) {
    return new Promise((resolve) => {
        if (fs.existsSync(destPath)) { resolve('exists'); return; }

        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout: 30000 }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
                const next = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : new URL(res.headers.location, url).href;
                download(next, destPath, redirectsLeft - 1).then(resolve);
                return;
            }
            if (res.statusCode !== 200) { resolve(`HTTP ${res.statusCode}`); return; }

            const tmp = destPath + '.tmp';
            const file = fs.createWriteStream(tmp);
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                try {
                    fs.renameSync(tmp, destPath);
                } catch (e) {
                    try { fs.unlinkSync(tmp); } catch {}
                    if (fs.existsSync(destPath)) { resolve('ok'); return; } // another instance won the race
                    resolve(`rename: ${e.message}`); return;
                }
                resolve('ok');
            });
            file.on('error', (e) => { try { fs.unlinkSync(tmp); } catch {} resolve(`write: ${e.message}`); });
        });
        req.on('error', (e) => resolve(`net: ${e.message}`));
        req.on('timeout', () => { req.destroy(); resolve('timeout'); });
    });
}

// --- Main ---
const manifest = {};
let ok = 0, skipped = 0, failed = 0;
const failures = [];

for (const url of urls) {
    // Preserve subdirectory structure from the URL path
    const urlPath = new URL(url).pathname
        .replace(/^\/asset\/(download|link)\//, '');
    const destPath = path.join(OUT_DIR, urlPath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    process.stdout.write(`  ${urlPath} ... `);
    const result = await download(url, destPath);

    if (result === 'ok') {
        const size = (fs.statSync(destPath).size / 1024).toFixed(0);
        console.log(`✓ (${size} KB)`);
        manifest[url] = urlPath;
        ok++;
    } else if (result === 'exists') {
        console.log(`already downloaded`);
        manifest[url] = urlPath;
        skipped++;
    } else {
        console.log(`✗ ${result}`);
        failures.push({ url, reason: result });
        failed++;
    }
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

console.log('\n=== Summary ===');
console.log(`Downloaded:  ${ok}`);
console.log(`Skipped:     ${skipped}`);
console.log(`Failed:      ${failed}`);
if (failures.length) {
    console.log('\nFailed:');
    failures.forEach(({ url, reason }) => console.log(`  ${reason}: ${url}`));
}
console.log(`\nManifest written to: ${MANIFEST_PATH}`);
