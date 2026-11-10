// Calls to the Google Places API (New), kept free of runtime-specific code so
// they can be tested outside the functions runtime.

export interface PlacesConfig {
  apiKey: string;
  /** Overridable for tests. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface Suggestion {
  provider_place_id: string;
  name: string;
  /** The rest of the address, to tell apart places with the same name. */
  description: string | null;
}

export interface PlaceResult {
  provider_place_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  /** IANA zone, when Google supplies one. */
  timezone: string | null;
}

/** A failure the caller should be told about, with the HTTP status to use. */
export class PlacesError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_BASE_URL = 'https://places.googleapis.com';
const PLACE_ID = /^[A-Za-z0-9_-]{1,300}$/;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{1,36}$/;

function checkSessionToken(token: unknown): string | undefined {
  if (token === undefined || token === null) return undefined;
  if (typeof token !== 'string' || !SESSION_TOKEN.test(token)) {
    throw new PlacesError(400, 'Invalid session token');
  }
  return token;
}

async function call(config: PlacesConfig, path: string, init: RequestInit): Promise<any> {
  const send = config.fetch ?? fetch;
  let response: Response;
  try {
    response = await send((config.baseUrl ?? DEFAULT_BASE_URL) + path, {
      ...init,
      headers: { ...init.headers, 'X-Goog-Api-Key': config.apiKey },
    });
  } catch {
    throw new PlacesError(502, 'Could not reach the places service');
  }
  if (!response.ok) {
    // Google's message can name our project or key restrictions; keep it server-side.
    console.error('Places API error', response.status, await response.text());
    throw new PlacesError(response.status === 400 ? 400 : 502, 'The places service refused the request');
  }
  return response.json();
}

export interface AutocompleteInput {
  input: unknown;
  sessionToken?: unknown;
  /** Bias results towards this point, e.g. somewhere already in the trip. */
  near?: unknown;
}

export async function autocomplete(
  config: PlacesConfig,
  request: AutocompleteInput,
): Promise<Suggestion[]> {
  const input = typeof request.input === 'string' ? request.input.trim() : '';
  if (input.length < 2 || input.length > 200) {
    throw new PlacesError(400, 'Search text must be 2 to 200 characters');
  }

  const body: Record<string, unknown> = { input };
  const sessionToken = checkSessionToken(request.sessionToken);
  if (sessionToken) body.sessionToken = sessionToken;

  const near = request.near as { lat?: unknown; lng?: unknown } | undefined;
  if (near && typeof near.lat === 'number' && typeof near.lng === 'number') {
    body.locationBias = {
      circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50_000 },
    };
  }

  const data = await call(config, '/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const suggestions: Suggestion[] = [];
  for (const entry of data.suggestions ?? []) {
    const prediction = entry.placePrediction;
    if (!prediction?.placeId) continue;
    suggestions.push({
      provider_place_id: prediction.placeId,
      name: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? 'Unnamed place',
      description: prediction.structuredFormat?.secondaryText?.text ?? null,
    });
  }
  return suggestions;
}

export interface DetailsInput {
  placeId: unknown;
  sessionToken?: unknown;
}

export async function details(config: PlacesConfig, request: DetailsInput): Promise<PlaceResult> {
  if (typeof request.placeId !== 'string' || !PLACE_ID.test(request.placeId)) {
    throw new PlacesError(400, 'Invalid place id');
  }
  const sessionToken = checkSessionToken(request.sessionToken);
  const query = sessionToken ? `?sessionToken=${sessionToken}` : '';
  const path = `/v1/places/${request.placeId}${query}`;
  const base = 'id,displayName,formattedAddress,location';

  let data: any;
  try {
    data = await call(config, path, { headers: { 'X-Goog-FieldMask': `${base},timeZone` } });
  } catch (error) {
    // An unknown field fails the whole request, so fall back to the fields
    // that have always existed rather than lose place search over a time zone.
    if (!(error instanceof PlacesError) || error.status !== 400) throw error;
    data = await call(config, path, { headers: { 'X-Goog-FieldMask': base } });
  }

  const lat = data.location?.latitude;
  const lng = data.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new PlacesError(502, 'The places service returned a place with no location');
  }
  return {
    provider_place_id: data.id ?? request.placeId,
    name: data.displayName?.text ?? 'Unnamed place',
    address: data.formattedAddress ?? null,
    lat,
    lng,
    timezone: typeof data.timeZone?.id === 'string' ? data.timeZone.id : null,
  };
}
