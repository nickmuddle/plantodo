// Itinerary import: paste a plan, get draft cards back. Nothing is written to
// the trip here; the app adds cards only after the person has reviewed them.
//
//   POST { "tripId": "...", "text": "..." }  ->  { "drafts": [...], "runId": "..." }
//
// Needs the secret ANTHROPIC_API_KEY. IMPORT_MODEL overrides the model.
// The pasted text is sent to the model and nowhere else: not stored, not logged.
import { checkImportText, DEFAULT_MODEL, ImportError, parseItinerary } from './parse.ts';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ALLOWED = 'You can’t import into this trip.';

/** Calls the project's own API as the signed-in user, so the database's access rules apply. */
function api(authorization: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${Deno.env.get('SUPABASE_URL')}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: authorization,
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      'Content-Type': 'application/json',
    },
  });
}

const rpc = (authorization: string, name: string, args: unknown) =>
  api(authorization, `/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Use POST' });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization || !(await api(authorization, '/auth/v1/user')).ok) {
      return json(401, { error: 'Sign in to import an itinerary.' });
    }

    const body = await request.json().catch(() => null);
    const tripId = body?.tripId;
    if (typeof tripId !== 'string' || !UUID.test(tripId)) {
      return json(400, { error: 'Unknown trip.' });
    }
    const text = checkImportText(body?.text);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json(503, { error: 'Import is not set up.' });
    const model = Deno.env.get('IMPORT_MODEL') || DEFAULT_MODEL;

    // Checks the caller is an owner or editor, applies the daily limit and
    // records the run, all in one step.
    const started = await rpc(authorization, 'start_import_run', {
      p_trip_id: tripId,
      p_input_chars: text.length,
      p_model: model,
    });
    if (!started.ok) {
      const failure = await started.json().catch(() => null);
      if (failure?.message === 'import_rate_limited') {
        return json(429, {
          error: 'You’ve reached the limit of 10 imports in 24 hours. Try again tomorrow.',
        });
      }
      if (failure?.message !== 'import_not_allowed') {
        console.error('start_import_run failed', started.status, failure?.code);
      }
      return json(403, { error: NOT_ALLOWED });
    }
    const runId: string = await started.json();

    // Dates only, to resolve "14 March" to a year. Readable because the caller is a member.
    const trips = await api(
      authorization,
      `/rest/v1/trips?id=eq.${tripId}&select=start_date,end_date`,
    );
    const trip = trips.ok ? (await trips.json())[0] : undefined;

    const result = await parseItinerary(
      { apiKey, model, baseUrl: Deno.env.get('ANTHROPIC_BASE_URL') || undefined },
      text,
      {
        today: new Date().toISOString().slice(0, 10),
        tripStart: trip?.start_date,
        tripEnd: trip?.end_date,
      },
    );

    await rpc(authorization, 'update_import_run', {
      p_run_id: runId,
      p_drafts_returned: result.drafts.length,
    });

    return json(200, { drafts: result.drafts, runId });
  } catch (error) {
    if (error instanceof ImportError) return json(error.status, { error: error.message });
    console.error('Import failed', error instanceof Error ? error.name : 'unknown');
    return json(500, { error: 'Something went wrong. Try again.' });
  }
});
