#!/usr/bin/env node
/**
 * Reorganizes downloaded files into per-world subfolders.
 *
 * For each helmgast.se/asset/(download|link)/ URL found in articles:
 *   - Reads the article's `world` frontmatter field
 *   - Moves scripts/downloads/files/<filename> → scripts/downloads/files/<world>/<filename>
 *   - Rewrites the URL in the article markdown to use <world>/<filename>
 *   - Updates scripts/downloads/manifest.json
 *
 * Files already in a subfolder (e.g. neotech/neo-1337/) keep their existing path.
 * Files referenced by multiple worlds: first world wins (logged as a warning).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = path.join(__dirname, '..', 'src', 'content');
const FILES_DIR = path.join(__dirname, 'downloads', 'files');
const MANIFEST_PATH = path.join(__dirname, 'downloads', 'manifest.json');

const FILE_URL_RE = /https?:\/\/helmgast\.se\/asset\/(?:download|link)\/[^\s)"'<\]]+/g;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp|tiff?)(\?.*)?$/i;

// --- Parse frontmatter world field ---
function getWorld(mdContent) {
    const m = mdContent.match(/^world:\s*(\S+)/m);
    return m ? m[1].trim() : null;
}

// --- Collect url → {world, files[]} ---
const urlToWorld = {};   // url → world slug
const urlToFiles = {};   // url → Set of article paths that reference it

for (const entry of fs.readdirSync(CONTENT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const collDir = path.join(CONTENT_ROOT, entry.name);
    for (const sub of fs.readdirSync(collDir, { withFileTypes: true })) {
        const subDir = sub.isDirectory() ? path.join(collDir, sub.name) : collDir;
        const mdFile = sub.isDirectory()
            ? path.join(subDir, sub.name + '.md')
            : path.join(collDir, sub.name);
        if (!mdFile.endsWith('.md') || !fs.existsSync(mdFile)) continue;

        const content = fs.readFileSync(mdFile, 'utf8');
        const world = getWorld(content);
        if (!world) continue;

        for (const match of content.matchAll(FILE_URL_RE)) {
            const url = match[0].replace(/[)\]'"]+$/, '');
            if (IMAGE_EXT.test(url)) continue;
            if (!urlToFiles[url]) urlToFiles[url] = new Set();
            urlToFiles[url].add(mdFile);
            if (!urlToWorld[url]) {
                urlToWorld[url] = world;
            } else if (urlToWorld[url] !== world) {
                console.warn(`⚠  URL referenced by multiple worlds (${urlToWorld[url]} + ${world}): ${url}`);
            }
        }
    }
}

// --- Load existing manifest ---
const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : {};

// --- Build new path for a URL ---
function newRelPath(url, world) {
    const urlPath = new URL(url).pathname
        .replace(/^\/asset\/(download|link)\//, '');
    // If already in a subfolder (e.g. neotech/neo-1337/foo.pdf), keep it
    // but prepend world if the first segment isn't already world
    const parts = urlPath.split('/');
    if (parts.length > 1) {
        // Already has subdirectory structure — keep as-is (product files etc.)
        return urlPath;
    }
    return `${world}/${urlPath}`;
}

// --- Move files and rewrite markdown ---
let moved = 0, skipped = 0, missing = 0;
const urlRewrites = {}; // old url → new url (for markdown rewriting)

for (const [url, world] of Object.entries(urlToWorld)) {
    const oldRelPath = manifest[url];  // where we downloaded it
    const targetRelPath = newRelPath(url, world);

    if (oldRelPath === targetRelPath) {
        skipped++;
        continue;
    }

    const oldAbsPath = oldRelPath ? path.join(FILES_DIR, oldRelPath) : null;
    const newAbsPath = path.join(FILES_DIR, targetRelPath);

    // Build new public URL (for manifest + article rewriting)
    const newUrl = url.replace(
        /\/asset\/(download|link)\/(.+)$/,
        (_, type, _file) => `/asset/${type}/${targetRelPath}`
    ).replace('helmgast.se/asset/', 'helmgast.se/asset/');

    // The new URL keeps the same base but different path segment
    // Actually we keep the helmgast.se URL format for now; only the local path changes.
    // We'll rewrite articles to point to a future GCS URL later.
    // For now just track the new local path.

    if (!oldAbsPath || !fs.existsSync(oldAbsPath)) {
        // Check if already at new location
        if (fs.existsSync(newAbsPath)) {
            manifest[url] = targetRelPath;
            skipped++;
            continue;
        }
        console.warn(`  ✗ missing: ${oldRelPath || '(not in manifest)'} for ${url}`);
        missing++;
        continue;
    }

    fs.mkdirSync(path.dirname(newAbsPath), { recursive: true });
    fs.renameSync(oldAbsPath, newAbsPath);
    manifest[url] = targetRelPath;
    urlRewrites[url] = url; // URL stays the same for now; local path updated
    console.log(`  → ${oldRelPath} → ${targetRelPath}`);
    moved++;
}

// --- Write updated manifest ---
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

console.log(`\n=== Summary ===`);
console.log(`Moved:    ${moved}`);
console.log(`Skipped:  ${skipped} (already correct or no change needed)`);
console.log(`Missing:  ${missing} (file not found locally)`);
console.log(`\nManifest updated: ${MANIFEST_PATH}`);

// --- Show new structure ---
console.log('\nNew folder structure:');
const subdirs = new Set(Object.values(manifest).map(p => p.split('/')[0]));
for (const d of [...subdirs].sort()) {
    const count = Object.values(manifest).filter(p => p.startsWith(d + '/') || p === d).length;
    // check if it's actually a subdir
    const isDir = Object.values(manifest).some(p => p.startsWith(d + '/'));
    if (isDir) console.log(`  ${d}/  (${Object.values(manifest).filter(p => p.startsWith(d + '/')).length} files)`);
    else console.log(`  ${d}  (root-level file)`);
}
