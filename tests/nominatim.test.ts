import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchPlacesNominatim,
  reverseGeocodeNominatim,
  isNominatimConfigured,
  NOMINATIM_ATTRIBUTION
} from '../lib/integrations/nominatim/client';

describe('Nominatim (OpenStreetMap) Safe Integration', () => {
  it('is always configured without requiring secret API tokens', () => {
    assert.equal(isNominatimConfigured(), true);
    assert.ok(NOMINATIM_ATTRIBUTION.includes('OpenStreetMap'));
  });

  it('rejects out-of-range coordinates gracefully', async () => {
    const res = await reverseGeocodeNominatim(999, 120);
    assert.equal(res.status, 'invalid_request');
    assert.equal(res.place, null);
  });

  it('rejects queries that are too short without network calls', async () => {
    const res = await searchPlacesNominatim('a');
    assert.equal(res.status, 'invalid_request');
    assert.equal(res.places.length, 0);
  });

  it('short-circuits verified Gwalior police stations locally with 100% precision', async () => {
    const res = await searchPlacesNominatim('Kotwali Police');
    assert.equal(res.status, 'ok');
    assert.ok(res.places.length > 0);
    const top = res.places[0];
    assert.equal(top.id, 'local-station-kotwali-police-station');
    assert.equal(top.lat, 26.196897);
    assert.equal(top.lng, 78.152689);
    assert.equal(top.type, 'police_station');
    assert.equal(top.relevance, 1.0);
  });

  it('short-circuits verified Gwalior departments locally', async () => {
    const res = await searchPlacesNominatim('CMHO Health');
    assert.equal(res.status, 'ok');
    assert.ok(res.places.length > 0);
    assert.equal(res.places[0].id, 'local-dept-GWL-HEALTH');
  });

  it('safely performs reverse geocoding with caching', async () => {
    // Kotwali Gwalior coordinates
    const lat = 26.196897;
    const lng = 78.152689;

    const t0 = Date.now();
    const first = await reverseGeocodeNominatim(lat, lng);
    const firstDuration = Date.now() - t0;

    assert.equal(first.status, 'ok');
    if (first.place) {
      assert.ok(first.place.address.toLowerCase().includes('gwalior'));
    }

    // Second call must hit cache instantly (< 50ms)
    const t1 = Date.now();
    const second = await reverseGeocodeNominatim(lat, lng);
    const secondDuration = Date.now() - t1;

    assert.equal(second.status, 'ok');
    assert.deepEqual(first.place, second.place);
    assert.ok(secondDuration < 50, `Second call must be fast cache hit: ${secondDuration}ms vs ${firstDuration}ms`);
  });
});
