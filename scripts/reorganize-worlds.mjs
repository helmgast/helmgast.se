#!/usr/bin/env node
/**
 * Reorganizes src/content/worlds/ from a flat layout to one folder per world,
 * same pattern as reorganize-articles.mjs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORLDS_DIR = path.join(__dirname, '..', 'src', 'content', 'worlds');

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp|tiff?|ico)$/i;
const IMAGE_REF_RE = /\.(\/[^)"'\s,\]]+)/g;

function findImageRefs(content) {
    const refs = new Set();
    let match;
    const re = new RegExp(IMAGE_REF_RE.source, 'g');
    while ((match = re.exec(content)) !== null) {
        const ref = '.' + match[1];
        if (IMAGE_EXTENSIONS.test(ref)) refs.add(ref);
    }
    return refs;
}

function copyFile(src, dest) {
    if (!fs.existsSync(src)) return false;
    if (fs.existsSync(dest)) return 'exists';
    fs.copyFileSync(src, dest);
    return true;
}

let worldsMoved = 0, imagesCopied = 0, imagesMissing = [], orphanedImages = [];

const mdFiles = fs.readdirSync(WORLDS_DIR)
    .filter(f => f.endsWith('.md') && fs.statSync(path.join(WORLDS_DIR, f)).isFile());

const flatImages = new Set(
    fs.readdirSync(WORLDS_DIR)
        .filter(f => IMAGE_EXTENSIONS.test(f) && fs.statSync(path.join(WORLDS_DIR, f)).isFile())
);

const claimedImages = new Set();

console.log(`Found ${mdFiles.length} worlds and ${flatImages.size} images in flat root\n`);

for (const mdFile of mdFiles) {
    const baseName = mdFile.replace(/\.md$/, '');
    const srcMd = path.join(WORLDS_DIR, mdFile);
    const destDir = path.join(WORLDS_DIR, baseName);
    const destMd = path.join(destDir, mdFile);

    const content = fs.readFileSync(srcMd, 'utf8');
    const refs = findImageRefs(content);

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (!fs.existsSync(destMd)) {
        fs.copyFileSync(srcMd, destMd);
        worldsMoved++;
    }

    for (const ref of refs) {
        const filename = ref.replace(/^\.\//, '');
        claimedImages.add(filename);
        const srcImg = path.join(WORLDS_DIR, filename);
        const destImg = path.join(destDir, filename);
        const result = copyFile(srcImg, destImg);
        if (result === true) { imagesCopied++; process.stdout.write('.'); }
        else if (result !== 'exists') imagesMissing.push({ world: mdFile, image: filename });
    }

    console.log(`\n✓ ${baseName}/ — ${refs.size} image(s)`);
}

for (const img of flatImages) {
    if (!claimedImages.has(img)) orphanedImages.push(img);
}

console.log('\n=== Summary ===');
console.log(`Worlds reorganised: ${worldsMoved}`);
console.log(`Images copied:      ${imagesCopied}`);
console.log(`Images missing:     ${imagesMissing.length}`);
console.log(`Orphaned images:    ${orphanedImages.length}`);

if (imagesMissing.length) {
    console.log('\nMissing:');
    imagesMissing.forEach(({ world, image }) => console.log(`  ${world} → ${image}`));
}
if (orphanedImages.length) {
    console.log('\nOrphaned (no world references them):');
    orphanedImages.forEach(f => console.log(`  ${f}`));
}

console.log('\nDone. Originals left in place — verify then delete manually.');
