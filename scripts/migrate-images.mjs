#!/usr/bin/env node
/**
 * Downloads external images referenced in content markdown files and rewrites
 * the references to relative local paths.
 *
 * Processes:
 *   - helmgast.se/asset/image/* and helmgast.se/asset/link/*  → download + rewrite
 *   - res.cloudinary.com/*                                     → download + rewrite (may fail)
 *   - cdn.abicart.com/*                                        → skip (kept as-is)
 *
 * Rewrites:
 *   - frontmatter `images:` array
 *   - frontmatter `landscape_image:` and `portrait_image:`
 *   - inline markdown ![alt](url) in body
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = path.join(__dirname, '..', 'src', 'content');

const SKIP_DOMAINS = ['cdn.abicart.com'];
const MIGRATE_DOMAINS = ['helmgast.se', 'res.cloudinary.com'];

let downloaded = 0, skipped = 0, failed = 0, alreadyLocal = 0;
const failures = [];

function shouldMigrate(url) {
    return MIGRATE_DOMAINS.some(d => url.includes(d));
}

function shouldSkip(url) {
    return SKIP_DOMAINS.some(d => url.includes(d));
}

function urlToFilename(url) {
    // Strip fragment (#thumb etc) and query string, take the last path segment
    const clean = url.split('#')[0].split('?')[0];
    return path.basename(clean);
}

async function download(url, destPath) {
    // Skip if already downloaded
    if (fs.existsSync(destPath)) {
        alreadyLocal++;
        return true;
    }

    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout: 15000 }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                // Follow one redirect
                download(res.headers.location, destPath).then(resolve);
                return;
            }
            if (res.statusCode !== 200) {
                console.log(`  ✗ HTTP ${res.statusCode}: ${url}`);
                resolve(false);
                return;
            }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(true); });
            file.on('error', () => { fs.unlinkSync(destPath); resolve(false); });
        });
        req.on('error', (e) => {
            console.log(`  ✗ ${e.message}: ${url}`);
            resolve(false);
        });
        req.on('timeout', () => {
            req.destroy();
            console.log(`  ✗ Timeout: ${url}`);
            resolve(false);
        });
    });
}

async function migrateUrl(url, articleDir) {
    const cleanUrl = url.split('#')[0].split('?')[0];
    const filename = urlToFilename(cleanUrl);
    const destPath = path.join(articleDir, filename);
    const relativePath = './' + filename;

    const ok = await download(cleanUrl, destPath);
    if (ok) {
        downloaded++;
        return relativePath;
    } else {
        failed++;
        failures.push({ url, articleDir });
        return null; // keep original
    }
}

async function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const articleDir = path.dirname(filePath);
    const filename = path.basename(filePath);
    let changed = false;

    // --- Frontmatter: images array ---
    // Matches:  - https://...
    content = await replaceAsync(content,
        /^(\s+-\s+)(https?:\/\/\S+)/gm,
        async (match, prefix, url) => {
            if (shouldSkip(url)) return match;
            if (!shouldMigrate(url)) return match;
            console.log(`  [images] ${url}`);
            const local = await migrateUrl(url, articleDir);
            if (local) { changed = true; return prefix + local; }
            return match;
        }
    );

    // --- Frontmatter: landscape_image / portrait_image ---
    content = await replaceAsync(content,
        /^((?:landscape_image|portrait_image):\s+)(https?:\/\/\S+)/gm,
        async (match, prefix, url) => {
            if (shouldSkip(url)) return match;
            if (!shouldMigrate(url)) return match;
            console.log(`  [world image] ${url}`);
            const local = await migrateUrl(url, articleDir);
            if (local) { changed = true; return prefix + local; }
            return match;
        }
    );

    // --- Markdown body: ![alt](url) and [![alt](url)](link) ---
    content = await replaceAsync(content,
        /!\[([^\]]*)\]\((https?:\/\/[^)\s#]+)([^)]*)\)/g,
        async (match, alt, url, fragment) => {
            if (shouldSkip(url)) return match;
            if (!shouldMigrate(url)) return match;
            console.log(`  [body img] ${url}`);
            const local = await migrateUrl(url, articleDir);
            if (local) { changed = true; return `![${alt}](${local})`; }
            return match;
        }
    );

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Updated: ${filename}`);
    }
}

// Helper: async version of String.replace
async function replaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
        promises.push(asyncFn(match, ...args));
        return match;
    });
    const results = await Promise.all(promises);
    let i = 0;
    return str.replace(regex, () => results[i++]);
}

async function main() {
    const collections = ['articles', 'worlds'];

    for (const collection of collections) {
        const dir = path.join(CONTENT_ROOT, collection);
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(dir, f));

        console.log(`\n=== ${collection} (${files.length} files) ===`);

        for (const file of files) {
            await processFile(file);
        }
    }

    console.log('\n=== Summary ===');
    console.log(`Downloaded:    ${downloaded}`);
    console.log(`Already local: ${alreadyLocal}`);
    console.log(`Failed:        ${failed}`);
    console.log(`Skipped (abicart): ${skipped}`);

    if (failures.length) {
        console.log('\nFailed URLs (kept as external):');
        failures.forEach(({ url }) => console.log(`  ${url}`));
    }
}

main().catch(console.error);
