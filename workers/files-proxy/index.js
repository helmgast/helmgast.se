/**
 * Cloudflare Worker: files.helmgast.se proxy
 *
 * Proxies GET/HEAD requests to the public GCS bucket helmgast-files.
 * Adds Cloudflare edge caching (1 hour for success, 10s for errors).
 *
 * URL mapping:
 *   https://files.helmgast.se/eon/arvtagaren.pdf
 *   → https://storage.googleapis.com/helmgast-files/eon/arvtagaren.pdf
 */

const GCS_BUCKET = 'https://storage.googleapis.com/helmgast-files';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Only allow GET and HEAD
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return new Response('Method not allowed', { status: 405 });
        }

        const gcsUrl = `${GCS_BUCKET}${url.pathname}`;

        // Check Cloudflare cache first
        const cacheKey = new Request(gcsUrl, request);
        const cache = caches.default;
        let response = await cache.match(cacheKey);

        if (!response) {
            response = await fetch(gcsUrl, {
                method: request.method,
                headers: {
                    'Accept': request.headers.get('Accept') || '*/*',
                    'Range': request.headers.get('Range') || '',
                },
            });

            // Clone for caching — only cache successful responses
            if (response.ok || response.status === 206) {
                const headers = new Headers(response.headers);
                headers.set('Cache-Control', 'public, max-age=3600');
                headers.set('Access-Control-Allow-Origin', '*');

                const cachedResponse = new Response(response.body, {
                    status: response.status,
                    headers,
                });
                ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
                return cachedResponse;
            } else {
                // Don't cache errors long
                return new Response(response.body, {
                    status: response.status,
                    headers: {
                        'Cache-Control': 'public, max-age=10',
                        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
                    },
                });
            }
        }

        return response;
    },
};
