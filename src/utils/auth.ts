import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js';

const AUTH0_DOMAIN = import.meta.env.PUBLIC_AUTH0_DOMAIN as string;
const AUTH0_CLIENT_ID = import.meta.env.PUBLIC_AUTH0_CLIENT_ID as string;
const AUTH0_AUDIENCE = import.meta.env.PUBLIC_AUTH0_AUDIENCE as string;
const API_BASE = (import.meta.env.PUBLIC_API_BASE as string) ?? 'https://api.helmgast.se';

let _client: Auth0Client | null = null;

export async function getAuth0Client(): Promise<Auth0Client> {
  if (_client) return _client;
  _client = await createAuth0Client({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    authorizationParams: {
      audience: AUTH0_AUDIENCE,
      redirect_uri: window.location.origin + '/callback',
    },
    cacheLocation: 'localstorage',
  });
  return _client;
}

export async function getAccessToken(): Promise<string | null> {
  const auth0 = await getAuth0Client();
  if (!(await auth0.isAuthenticated())) return null;
  try {
    return await auth0.getTokenSilently();
  } catch {
    // Token expired or refresh failed — treat as logged out
    return null;
  }
}

export async function apiFetch(path: string): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export type MeResponse = {
  user_id: string;
  primary_email: string | null;
  identities: {
    provider: string;
    connection: string;
    email: string | null;
    display_name: string | null;
    linked_at: string;
  }[];
  entitlements: string[];   // product slugs
  follows: { world_slug: string; notification: string; followed_at: string }[];
};
