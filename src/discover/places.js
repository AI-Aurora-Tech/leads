// Busca via Google Places API (New) — Text Search.
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.primaryTypeDisplayName',
  'places.googleMapsUri',
  'places.businessStatus',
  'nextPageToken',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function searchPlaces({ query, apiKey, max = 60 }) {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY não configurada no .env (ou use --fonte maps).');
  const results = [];
  let pageToken;
  do {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELDS,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const p of data.places ?? []) {
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
      results.push({
        placeId: p.id,
        name: p.displayName?.text ?? '',
        rawPhone: p.internationalPhoneNumber || p.nationalPhoneNumber || null,
        address: p.formattedAddress ?? null,
        website: p.websiteUri ?? null,
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? 0,
        category: p.primaryTypeDisplayName?.text ?? null,
        mapsUrl: p.googleMapsUri ?? null,
        source: 'places',
      });
    }
    pageToken = data.nextPageToken;
    if (pageToken) await sleep(1500);
  } while (pageToken && results.length < max);
  return results.slice(0, max);
}
