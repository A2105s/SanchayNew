import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseCnr, CNR_PATTERN } from '@/lib/integrations/ecourts/cnr';
import {
  assessVehicleRelevance,
  VEHICLE_CASE_TYPES,
  VEHICLE_CASE_TYPE_LABELS
} from '@/lib/integrations/ecourts/vehicle-relevance';

/**
 * Unit coverage for the eCourts integration boundaries that carry real rules:
 * - which operator input may be sent to a billable lookup at all, and
 * - which court cases are considered to concern a vehicle.
 * No network and no database are touched.
 */

test('CNR validation accepts exactly the documented 16-character shape', () => {
  assert.match('DLHC010001232024', CNR_PATTERN);
  assert.equal(normaliseCnr('DLHC010001232024'), 'DLHC010001232024');
  // Operator paste habits: lowercase, stray whitespace.
  assert.equal(normaliseCnr(' dlhc010001232024 '), 'DLHC010001232024');
  assert.equal(normaliseCnr('DLHC 0100 01232024'), 'DLHC010001232024');
});

test('CNR validation rejects anything that cannot be a case number', () => {
  for (const bad of [
    '',
    'MP04MH9479', // a registration number is NOT a case identifier
    'DLHC01000123202', // 15 chars
    'DLHC0100012320240', // 17 chars
    'DLH1010001232024', // digit in the court code
    'DLHC01000123202X', // letter in the year
    'DLHC-0100-0123-2024'
  ]) {
    assert.equal(normaliseCnr(bad), null, `expected rejection: ${bad}`);
  }
});

test('vehicle-relevant case types are the verified motor-accident codes', () => {
  assert.deepEqual([...VEHICLE_CASE_TYPES], ['MACA', 'MCOC']);
  assert.equal(VEHICLE_CASE_TYPE_LABELS.MACA, 'Motor Accident Claims Appeal');
  assert.equal(VEHICLE_CASE_TYPE_LABELS.MCOC, 'Motor Vehicle Compensation Case');
});

test('motor-accident case types are flagged as vehicle-relevant', () => {
  for (const caseType of ['MACA', 'MCOC']) {
    const result = assessVehicleRelevance({ caseType });
    assert.equal(result.relevant, true, caseType);
    assert.ok(result.reasons.length > 0);
  }
});

test('Motor Vehicles Act citations make a case vehicle-relevant', () => {
  const result = assessVehicleRelevance({
    caseType: 'CRL_A',
    actsAndSections: ['Bharatiya Nyaya Sanhita (B.N.S.), 2023 - Section 303', 'Motor Vehicles Act, 1988 - Section 184']
  });
  assert.equal(result.relevant, true);
  assert.ok(result.reasons.some((reason) => /Motor Vehicles Act/i.test(reason)));
});

test('seizure / impound keywords make a case vehicle-relevant', () => {
  for (const keyword of ['vehicle seized', 'confiscation ordered', 'impounded at PS', 'road accident']) {
    const result = assessVehicleRelevance({ caseType: 'CRL_A', keywords: [keyword] });
    assert.equal(result.relevant, true, keyword);
  }
});

test('an unrelated case is NOT claimed to be vehicle-relevant', () => {
  // Modelled on a real fetched case: a writ petition about a school admission.
  const result = assessVehicleRelevance({
    caseType: 'WP_C',
    actsAndSections: [],
    keywords: []
  });
  assert.equal(result.relevant, false);
  assert.deepEqual(result.reasons, []);
});

test('relevance is case-insensitive and tolerates the provider sending junk entries', () => {
  const result = assessVehicleRelevance({
    caseType: 'maca',
    actsAndSections: [null, 42, 'MOTOR VEHICLES ACT, 1988 - Section 166'] as unknown as string[],
    keywords: [null] as unknown as string[]
  });
  assert.equal(result.relevant, true);
  assert.equal(result.reasons.length, 2);
});
