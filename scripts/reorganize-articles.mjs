#!/usr/bin/env node
/**
 * Reorganizes src/content/articles/ from a flat layout to one folder per article.
 *
 * Before:
 *   src/content/articles/
 *     my-article.md
 *     hero.jpg
 *     shared-image.png
 *
 * After:
 *   src/content/articles/
 *     my-article/
 *       my-article.md
 *       hero.jpg
 *       shared-image.png   ← copied into every folder that needs it
 *
 * Non-destructive: originals are left in place. Delete them manually after verifying.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = path.join(__dirname, '..', 'src', 'content', 'articles');

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp|tiff?|ico)$/i;

// Match any relative image path starting with ./ in either frontmatter or body
// Covers: ./image.jpg  ./subdir/image.png  etc.
const IMAGE_REF_RE = /\.(\/[^)"'\s,\]]+)/g;

function findImageRefs(content) {
    const refs = new Set();
    let match;
    const re = new RegExp(IMAGE_REF_RE.source, 'g');
    while ((match = re.exec(content)) !== null) {
        const ref = '.' + match[1];
        // Only keep actual image file extensions
        if (IMAGE_EXTENSIONS.test(ref)) {
            refs.add(ref);
        }
    }
    return refs;
}

function copyFile(src, dest) {
    if (!fs.existsSync(src)) return false;
    if (fs.existsSync(dest)) return 'exists';
    fs.copyFileSync(src, dest);
    return true;
}

let articlesMoved = 0;
let imagesCopied = 0;
let imagesAlreadyThere = 0;
let imagesMissing = [];
let orphanedImages = [];

// Collect all md files (only direct children, not already in subfolders)
const mdFiles = fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.md') && fs.statSync(path.join(ARTICLES_DIR, f)).isFile());

// Collect all image files currently in the flat root
const flatImages = new Set(
    fs.readdirSync(ARTICLES_DIR)
        .filter(f => IMAGE_EXTENSIONS.test(f) && fs.statSync(path.join(ARTICLES_DIR, f)).isFile())
);

// Track which images are claimed by at least one article
const claimedImages = new Set();

console.log(`Found ${mdFiles.length} articles and ${flatImages.size} images in flat root\n`);

for (const mdFile of mdFiles) {
    const baseName = mdFile.replace(/\.md$/, '');
    const srcMd = path.join(ARTICLES_DIR, mdFile);
    const destDir = path.join(ARTICLES_DIR, baseName);
    const destMd = path.join(destDir, mdFile);

    const content = fs.readFileSync(srcMd, 'utf8');
    const refs = findImageRefs(content);

    // Create destination folder
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy the markdown file
    if (!fs.existsSync(destMd)) {
        fs.copyFileSync(srcMd, destMd);
        articlesMoved++;
    }

    // Copy each referenced image
    for (const ref of refs) {
        const filename = ref.replace(/^\.\//, '');
        claimedImages.add(filename);
        const srcImg = path.join(ARTICLES_DIR, filename);
        const destImg = path.join(destDir, filename);

        const result = copyFile(srcImg, destImg);
        if (result === true) {
            imagesCopied++;
            process.stdout.write('.');
        } else if (result === 'exists') {
            imagesAlreadyThere++;
        } else {
            imagesMissing.push({ article: mdFile, image: filename });
        }
    }

    if (refs.size > 0) {
        console.log(`\n✓ ${baseName}/ — ${refs.size} image(s)`);
    } else {
        console.log(`✓ ${baseName}/ — no images`);
    }
}

// Report images not claimed by any article
for (const img of flatImages) {
    if (!claimedImages.has(img)) {
        orphanedImages.push(img);
    }
}

console.log('\n=== Summary ===');
console.log(`Articles reorganised: ${articlesMoved}`);
console.log(`Images copied:        ${imagesCopied}`);
console.log(`Images already there: ${imagesAlreadyThere}`);
console.log(`Images missing:       ${imagesMissing.length}`);
console.log(`Orphaned images:      ${orphanedImages.length}`);

if (imagesMissing.length) {
    console.log('\nMissing (ref in md but file not found):');
    imagesMissing.forEach(({ article, image }) => console.log(`  ${article} → ${image}`));
}

if (orphanedImages.length) {
    console.log('\nOrphaned (image file with no article reference):');
    orphanedImages.forEach(f => console.log(`  ${f}`));
}

console.log('\nDone. Originals left in place — verify then delete the flat files manually.');
