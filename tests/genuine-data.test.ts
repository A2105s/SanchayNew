import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import STATIONS_DATA from '../lib/data/gwalior-police-stations.json';
import DEPARTMENTS_DATA from '../lib/data/gwalior-departments.json';
import POLICE_DIRECTORY from '../lib/data/gwalior-police-directory.json';
import FLEET_BLUEPRINTS from '../lib/data/gwalior-fleet-blueprints.json';
import LEGAL_CASES_DATA from '../lib/data/gwalior-legal-cases.json';

describe('Genuine Gwalior Government Data Integrity', () => {
  it('contains all 37 Gwalior police stations with genuine incharges and CUG contacts', () => {
    assert.equal(STATIONS_DATA.length, 37);

    for (const s of STATIONS_DATA) {
      assert.ok(s.id, 'Station must have id');
      assert.ok(s.name.includes('Police Station') || s.name.includes('Thana'), `Station name valid: ${s.name}`);
      assert.ok(s.inchargeName && s.inchargeName.length > 5, `Station must have genuine incharge: ${s.name}`);
      assert.ok(s.phone && (s.phone.startsWith('0751') || s.phone.startsWith('0752') || s.phone.startsWith('+91')), `Station phone valid: ${s.phone}`);
      assert.ok(s.cugMobile && s.cugMobile.startsWith('+91'), `CUG mobile valid: ${s.cugMobile}`);
      assert.ok(s.email && s.email.endsWith('@mppolice.gov.in'), `Official MP Police email valid: ${s.email}`);
      assert.ok(s.lat > 25.5 && s.lat < 26.5, `Lat in Gwalior bounds: ${s.lat}`);
      assert.ok(s.lng > 77.8 && s.lng < 78.8, `Lng in Gwalior bounds: ${s.lng}`);
    }
  });

  it('contains all 6 key Gwalior administrative departments with official helplines', () => {
    assert.equal(DEPARTMENTS_DATA.length, 6);
    const codes = DEPARTMENTS_DATA.map((d) => d.code);
    assert.deepEqual(codes.sort(), ['GWL-DISTRICT', 'GWL-ELECTION', 'GWL-GMC', 'GWL-HEALTH', 'GWL-POLICE', 'GWL-PWD'].sort());

    const police = DEPARTMENTS_DATA.find((d) => d.code === 'GWL-POLICE')!;
    assert.ok(police.head.includes('Superintendent of Police'));
    assert.ok(police.phone.includes('0751-2445222'));
    assert.ok(police.email === 'sp_gwalior@mppolice.gov.in');
  });

  it('verifies live Supabase Cloud database reflects genuine incharge officers and CUG contacts', async () => {
    const prisma = new PrismaClient();
    try {
      const kotwali = await prisma.station.findUnique({
        where: { code: 'kotwali-police-station' }
      });
      assert.ok(kotwali, 'Kotwali station must exist in DB');
      assert.equal(kotwali.inchargeName, 'Insp. Vinod Vinayak Karkare');
      assert.equal(kotwali.phone, '+91 77010 46916');
      assert.equal(kotwali.lat, 26.196897);
      assert.equal(kotwali.lng, 78.152689);

      const university = await prisma.station.findUnique({
        where: { code: 'university-police-station' }
      });
      assert.ok(university);
      assert.equal(university.inchargeName, 'Insp. Ravindra Jatav');
      assert.equal(university.phone, '+91 77010 46907');

      // Verify vehicles in DB use genuine MP07 registration series
      const sampleVehicles = await prisma.vehicle.findMany({
        take: 10,
        select: { registrationNumber: true, makeModel: true, sector: true }
      });
      for (const v of sampleVehicles) {
        assert.ok(v.registrationNumber.startsWith('MP07-'), `Registration must start with MP07-: ${v.registrationNumber}`);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('exposes all active police stations via /api/auth/stations directory', async () => {
    const { GET: getStations } = await import('../app/api/auth/stations/route');
    const res = await getStations();
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(json.success);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length >= 20, `Must list 20+ police stations, found: ${json.data.length}`);
    const kotwali = json.data.find((d: { station: string }) => d.station.includes('Kotwali'));
    assert.ok(kotwali, 'Kotwali station must be listed');
    assert.ok(kotwali.username, 'Kotwali station must have username');
  });

  it('allows police station sign-in for any station with demo password', async () => {
    const { POST: login } = await import('../app/api/auth/login/route');
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'station.thatipur', password: 'Sanchay@Demo1' })
    });
    const res = await login(req);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(json.success);
    assert.equal(json.data.role, 'STATION_OFFICER');
    assert.ok(json.data.stationId);
  });
});
