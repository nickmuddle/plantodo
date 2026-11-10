import { describe, expect, it } from 'vitest';
import {
  autocomplete,
  details,
  PlacesError,
} from '../../../supabase/functions/places/google';

// The place-search function's Google calls, run against canned responses in
// the shape Google documents. They check our side of the contract only.

interface Call {
  url: string;
  init: RequestInit;
}

function fakeGoogle(respond: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const call = { url, init };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return new Response(JSON.stringify(body), { status });
  }) as typeof globalThis.fetch;
  return { calls, config: { apiKey: 'test-key', baseUrl: 'https://google.test', fetch } };
}

const header = (call: Call, name: string) =>
  (call.init.headers as Record<string, string>)[name];

describe('autocomplete', () => {
  it('sends the search, key, session and bias, and flattens the result', async () => {
    const google = fakeGoogle(() => ({
      body: {
        suggestions: [
          {
            placePrediction: {
              placeId: 'abc',
              text: { text: 'Ramiro, Lisbon' },
              structuredFormat: { mainText: { text: 'Ramiro' }, secondaryText: { text: 'Lisbon' } },
            },
          },
          { queryPrediction: { text: { text: 'ramiro restaurants' } } },
          { placePrediction: { placeId: 'def', text: { text: 'Ramiro Bar' } } },
        ],
      },
    }));

    const result = await autocomplete(google.config, {
      input: '  Ramiro ',
      sessionToken: 'a1b2-c3',
      near: { lat: 38.7, lng: -9.1 },
    });

    expect(result).toEqual([
      { provider_place_id: 'abc', name: 'Ramiro', description: 'Lisbon' },
      { provider_place_id: 'def', name: 'Ramiro Bar', description: null },
    ]);
    const [call] = google.calls;
    expect(call!.url).toBe('https://google.test/v1/places:autocomplete');
    expect(header(call!, 'X-Goog-Api-Key')).toBe('test-key');
    expect(JSON.parse(call!.init.body as string)).toEqual({
      input: 'Ramiro',
      sessionToken: 'a1b2-c3',
      locationBias: { circle: { center: { latitude: 38.7, longitude: -9.1 }, radius: 50000 } },
    });
  });

  it('returns nothing when Google has no suggestions', async () => {
    const google = fakeGoogle(() => ({ body: {} }));
    expect(await autocomplete(google.config, { input: 'zzzz' })).toEqual([]);
  });

  it('rejects bad input without calling Google', async () => {
    const google = fakeGoogle(() => ({ body: {} }));
    for (const input of ['', 'a', 'x'.repeat(201), 42, null]) {
      await expect(autocomplete(google.config, { input })).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      autocomplete(google.config, { input: 'cafe', sessionToken: 'has spaces' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(google.calls).toEqual([]);
  });

  it('hides Google’s error text from the caller', async () => {
    const google = fakeGoogle(() => ({
      status: 403,
      body: { error: { message: 'API key not valid for project 12345' } },
    }));
    const error = await autocomplete(google.config, { input: 'cafe' }).catch((e) => e);
    expect(error).toBeInstanceOf(PlacesError);
    expect(error.status).toBe(502);
    expect(error.message).not.toContain('12345');
  });
});

describe('details', () => {
  const lisbon = {
    id: 'abc',
    displayName: { text: 'Ramiro' },
    formattedAddress: 'Av. Almirante Reis 1, Lisboa',
    location: { latitude: 38.72, longitude: -9.135 },
  };

  it('asks for the fields we store and maps them', async () => {
    const google = fakeGoogle(() => ({ body: { ...lisbon, timeZone: { id: 'Europe/Lisbon' } } }));
    const place = await details(google.config, { placeId: 'abc', sessionToken: 's1' });
    expect(place).toEqual({
      provider_place_id: 'abc',
      name: 'Ramiro',
      address: 'Av. Almirante Reis 1, Lisboa',
      lat: 38.72,
      lng: -9.135,
      timezone: 'Europe/Lisbon',
    });
    expect(google.calls[0]!.url).toBe('https://google.test/v1/places/abc?sessionToken=s1');
    expect(header(google.calls[0]!, 'X-Goog-FieldMask')).toBe(
      'id,displayName,formattedAddress,location,timeZone',
    );
  });

  it('retries without the time zone if Google rejects that field', async () => {
    const google = fakeGoogle((call) =>
      header(call, 'X-Goog-FieldMask')?.includes('timeZone')
        ? { status: 400, body: { error: { message: 'Invalid field: timeZone' } } }
        : { body: lisbon },
    );
    const place = await details(google.config, { placeId: 'abc' });
    expect(place).toMatchObject({ name: 'Ramiro', timezone: null });
    expect(google.calls).toHaveLength(2);
  });

  it('rejects ids that could alter the request path', async () => {
    const google = fakeGoogle(() => ({ body: lisbon }));
    for (const placeId of ['', '../v1/other', 'abc?x=1', 'a/b', 7]) {
      await expect(details(google.config, { placeId })).rejects.toMatchObject({ status: 400 });
    }
    expect(google.calls).toEqual([]);
  });

  it('fails clearly when a place has no location', async () => {
    const google = fakeGoogle(() => ({ body: { id: 'abc', displayName: { text: 'Nowhere' } } }));
    await expect(details(google.config, { placeId: 'abc' })).rejects.toMatchObject({ status: 502 });
  });
});
