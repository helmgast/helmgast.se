/**
 * Helmgast API Worker
 *
 * Routes:
 *   GET  /me        — returns user profile + linked identities + entitlements (requires Bearer JWT)
 *   GET  /health    — liveness check
 */

const CORS_ORIGINS = [
  'https://helmgast.se',
  'https://helmgast.pages.dev',
  'http://localhost:4321',
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return corsResponse(request, new Response(null, { status: 204 }));
    }

    let response;
    if (url.pathname === '/health') {
      response = json({ ok: true });
    } else if (url.pathname === '/me' && request.method === 'GET') {
      response = await handleMe(request, env);
    } else {
      response = json({ error: 'Not found' }, 404);
    }

    return corsResponse(request, response);
  },
};

// ---------------------------------------------------------------------------
// /me handler
// ---------------------------------------------------------------------------

async function handleMe(request, env) {
  const token = getBearerToken(request);
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  let payload;
  try {
    payload = await verifyJwt(token, env);
  } catch (err) {
    return json({ error: `Invalid token: ${err.message}` }, 401);
  }

  // Auth0 sub is the provider_sub, e.g. "google-oauth2|123" or "auth0|abc"
  const providerSub = payload.sub;
  const provider = 'auth0';

  // Derive the connection method from the sub prefix, e.g. "google-oauth2|..." → "google-oauth2"
  // For username/password logins Auth0 uses "auth0|..." — we label that "email"
  const connection = deriveConnection(payload);

  let user = await findUserByIdentity(providerSub, provider, env);

  if (!user) {
    user = await createUserWithIdentity({
      providerSub,
      provider,
      connection,
      email: payload.email,
      displayName: payload.name,
      pictureUrl: payload.picture,
    }, env);
  }

  // Load all linked identities for display
  const identities = await getIdentities(user.id, env);

  // Load entitlements from KV for all emails across identities
  const emails = [...new Set(identities.map(i => i.email).filter(Boolean))];
  const entitlements = await getEntitlements(emails, env);

  // Load followed games
  const follows = await getGameFollows(user.id, env);

  return json({
    user_id: user.id,
    primary_email: user.primary_email,
    identities: identities.map(i => ({
      provider: i.provider,
      connection: i.connection,
      email: i.email,
      display_name: i.display_name,
      linked_at: i.linked_at,
    })),
    entitlements,  // array of product slugs
    follows,       // [{ world_slug, notification }]
  });
}

// ---------------------------------------------------------------------------
// D1: user lookup and creation
// ---------------------------------------------------------------------------

async function findUserByIdentity(providerSub, provider, env) {
  const row = await env.DB.prepare(`
    SELECT u.id, u.primary_email, u.created_at, u.updated_at
    FROM user_identities ui
    JOIN users u ON u.id = ui.user_id
    WHERE ui.provider = ? AND ui.provider_sub = ?
  `).bind(provider, providerSub).first();
  return row ?? null;
}

async function createUserWithIdentity({ providerSub, provider, connection, email, displayName, pictureUrl }, env) {
  const userId = nanoid();
  const identityId = nanoid();
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (id, primary_email, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(userId, email ?? null, now, now),
    env.DB.prepare(`
      INSERT INTO user_identities (id, user_id, provider, provider_sub, connection, email, display_name, picture_url, linked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(identityId, userId, provider, providerSub, connection, email ?? null, displayName ?? null, pictureUrl ?? null, now),
  ]);

  return { id: userId, primary_email: email ?? null, created_at: now, updated_at: now };
}

async function getIdentities(userId, env) {
  const result = await env.DB.prepare(`
    SELECT provider, provider_sub, connection, email, display_name, picture_url, linked_at
    FROM user_identities
    WHERE user_id = ?
    ORDER BY linked_at ASC
  `).bind(userId).all();
  return result.results ?? [];
}

async function getGameFollows(userId, env) {
  const result = await env.DB.prepare(`
    SELECT world_slug, notification, followed_at
    FROM user_game_follows
    WHERE user_id = ?
    ORDER BY followed_at ASC
  `).bind(userId).all();
  return result.results ?? [];
}

// ---------------------------------------------------------------------------
// KV: entitlements
// ---------------------------------------------------------------------------

async function getEntitlements(emails, env) {
  const productIds = new Set();
  await Promise.all(
    emails.map(async email => {
      const val = await env.ENTITLEMENTS.get(`entitlements:${email}`, 'json');
      if (Array.isArray(val)) val.forEach(id => productIds.add(id));
    })
  );
  return [...productIds];
}

// ---------------------------------------------------------------------------
// JWT verification (Auth0, RS256)
// ---------------------------------------------------------------------------

let cachedJwks = null;
let jwksCachedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getJwks(domain) {
  const now = Date.now();
  if (cachedJwks && now - jwksCachedAt < JWKS_TTL_MS) return cachedJwks;
  const resp = await fetch(`https://${domain}/.well-known/jwks.json`);
  if (!resp.ok) throw new Error('Failed to fetch JWKS');
  cachedJwks = await resp.json();
  jwksCachedAt = now;
  return cachedJwks;
}

async function verifyJwt(token, env) {
  const domain = env.AUTH0_DOMAIN;
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('Malformed token');

  const header = JSON.parse(b64decode(headerB64));
  if (header.alg !== 'RS256') throw new Error(`Unexpected algorithm: ${header.alg}`);

  const jwks = await getJwks(domain);
  const jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error(`No matching key for kid: ${header.kid}`);

  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
  if (!valid) throw new Error('Invalid signature');

  const payload = JSON.parse(b64decode(payloadB64));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');
  if (payload.iss !== `https://${domain}/`) throw new Error('Invalid issuer');
  if (env.AUTH0_AUDIENCE) {
    const aud = payload.aud;
    if (aud !== env.AUTH0_AUDIENCE && !(Array.isArray(aud) && aud.includes(env.AUTH0_AUDIENCE))) {
      throw new Error('Invalid audience');
    }
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveConnection(payload) {
  // Auth0 sub format: "<connection>|<id>"
  // e.g. "google-oauth2|123" → "google-oauth2"
  //      "auth0|abc"         → "email"  (username/password)
  //      "github|123"        → "github"
  const sub = payload.sub ?? '';
  const prefix = sub.split('|')[0];
  if (prefix === 'auth0') return 'email';
  return prefix || 'unknown';
}

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function b64decode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsResponse(request, response) {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowed);
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  return new Response(response.body, { status: response.status, headers });
}

// Tiny nanoid-like ID generator (no external dependency)
function nanoid(size = 21) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}
