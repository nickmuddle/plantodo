// Place search for trip cards. The app calls this instead of Google directly
// so the Google key stays on the server.
//
//   POST { "action": "autocomplete", "input": "...", "sessionToken"?, "near"? }
//   POST { "action": "details", "placeId": "...", "sessionToken"? }
//
// Needs the secret GOOGLE_MAPS_SERVER_KEY (see the README).
import { autocomplete, details, PlacesError } from './google.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Only signed-in users may search: every search costs money. */
async function isSignedIn(request: Request): Promise<boolean> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return false;
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  });
  return response.ok;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Use POST' });

  try {
    if (!(await isSignedIn(request))) return json(401, { error: 'Sign in to search for places' });

    const apiKey = Deno.env.get('GOOGLE_MAPS_SERVER_KEY');
    if (!apiKey) return json(503, { error: 'Place search is not set up' });
    const config = { apiKey, baseUrl: Deno.env.get('GOOGLE_PLACES_BASE_URL') || undefined };

    const body = await request.json().catch(() => null);
    switch (body?.action) {
      case 'autocomplete':
        return json(200, { suggestions: await autocomplete(config, body) });
      case 'details':
        return json(200, { place: await details(config, body) });
      default:
        return json(400, { error: 'Unknown action' });
    }
  } catch (error) {
    if (error instanceof PlacesError) return json(error.status, { error: error.message });
    console.error(error);
    return json(500, { error: 'Something went wrong' });
  }
});
