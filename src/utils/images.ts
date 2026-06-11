import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

// Eagerly load all images co-located with content files
const contentImages = import.meta.glob<{ default: ImageMetadata }>(
    '/src/content/**/*.{jpg,jpeg,png,gif,avif,webp,svg}',
    { eager: true }
);

/**
 * Resolves an image string from article/world frontmatter to ImageMetadata or a URL string.
 *
 * Supports three formats:
 *   ./hero.jpg          — local file next to the content .md file (optimized at build)
 *   /logos/foo.png      — file in public/ (served as-is, no optimization)
 *   https://...         — external URL (optimized at build if domain is whitelisted)
 *
 * @param src     The image string from frontmatter
 * @param contentId  The collection entry id (e.g. "eon/my-article.md")
 */
export function resolveContentImage(
    src: string,
    contentId: string,
    collection: string = 'articles'
): ImageMetadata | string {
    if (src.startsWith('http') || src.startsWith('/')) {
        return src;
    }
    // Relative path — resolve against the content file's directory
    const dir = `/src/content/${collection}/${contentId.replace(/[^/]+$/, '')}`;
    const key = dir + src.replace(/^\.\//, '');
    return contentImages[key]?.default ?? src;
}

/**
 * Resolves and optimizes an image for use as a CSS background-image url().
 * Returns an empty string if no src provided.
 */
export async function getBackgroundImage(
    src: string | undefined,
    contentId: string,
    width: number,
    height: number,
    collection: string = 'articles'
): Promise<string> {
    if (!src) return '';
    if (src.startsWith('/')) {
        return src;
    }
    const resolved = resolveContentImage(src, contentId, collection);
    // If still a relative string, the glob lookup failed — can't serve it safely
    if (typeof resolved === 'string' && !resolved.startsWith('http')) {
        console.warn(`[images] Could not resolve local image: ${src} (${collection}/${contentId})`);
        return '';
    }
    const optimized = await getImage({ src: resolved as any, width, height, format: 'webp' });
    return optimized.src;
}
