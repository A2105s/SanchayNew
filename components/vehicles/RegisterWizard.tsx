'use client';

import { useState } from 'react';
import { DocumentScanPanel } from '@/components/ai/DocumentScanPanel';
import type { ExtractKind, ExtractedFields } from '@/types/ai';
import { Check, Cpu, MapPin, QrCode as QrIcon, FileSpreadsheet, ShieldQuestion } from 'lucide-react';
import { AddressSearch } from '@/components/maps/AddressSearch';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { api, ApiError } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import type { GpsSource, OwnershipCategory, Sector, StationView, VehicleClass, VehicleInput, VehicleView } from '@/types';
import { SECTOR_LABEL, CLASS_LABEL, OWNERSHIP_LABEL } from '@/lib/fleet/format';

const SECTORS: Sector[] = ['GMC_WASTE', 'AMBULANCE_108', 'POLICE_PATROL', 'PWD_HEAVY', 'HEALTH_VAN', 'ELECTION_REQUISITION'];
const CLASSES: VehicleClass[] = ['PATROL_CAR', 'MOTORCYCLE', 'VAN', 'HEAVY'];
const OWNERSHIP: OwnershipCategory[] = ['GOVERNMENT_FLEET', 'SEIZED_IMPOUNDED', 'OTHER_UNVERIFIED'];

const sectorLabel = (s: Sector) => SECTOR_LABEL?.[s] ?? s;
const classLabel = (c: VehicleClass) => CLASS_LABEL?.[c] ?? c;

// Tolerant Indian registration format, e.g. MP07-AB-1234, MP 07 AB 1234, MP07AB1234
const REG_REGEX = /^[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{0,3}[\s-]?\d{1,4}$/i;

interface FormState {
  registrationNumber: string;
  displayName: string;
  sector: Sector;
  vehicleClass: VehicleClass;
  vehicleType: string;
  stationId: string;
  managingUnit: string;
  claimedOwnership: OwnershipCategory;
  driverName: string;
  driverPhone: string;
  makeModel: string;
  year: string;
  fuelType: string;
  seating: string;
  chassisNumber: string;
  engineNumber: string;
  odometerKm: string;
  pucExpiry: string;
  insuranceExpiry: string;
  fitnessExpiry: string;
  gpsSource: GpsSource;
  /** Free-text last known position; only a confirmed suggestion becomes coordinates. */
  locationAddress: string;
  latitude: number | null;
  longitude: number | null;
}

const emptyForm: FormState = {
  registrationNumber: '',
  displayName: '',
  sector: 'POLICE_PATROL',
  vehicleClass: 'PATROL_CAR',
  vehicleType: '',
  stationId: '',
  managingUnit: '',
  claimedOwnership: 'OTHER_UNVERIFIED',
  driverName: '',
  driverPhone: '',
  makeModel: '',
  year: '',
  fuelType: '',
  seating: '',
  chassisNumber: '',
  engineNumber: '',
  odometerKm: '',
  pucExpiry: '',
  insuranceExpiry: '',
  fitnessExpiry: '',
  gpsSource: 'MANUAL_CSV',
  locationAddress: '',
  latitude: null,
  longitude: null
};

/** Gwalior city centre - biases address suggestions toward the fleet's operating area. */
const GWALIOR_PROXIMITY = { lat: 26.2183, lng: 78.1828 };

const GPS_OPTIONS: { value: GpsSource; title: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'AIS_140', title: 'AIS-140 hardware tracker', desc: 'Government-grade GPS device streaming live position, speed and alerts.', icon: <Cpu size={18} /> },
  { value: 'QR_PWA', title: 'QR / PWA phone check-in', desc: 'Driver scans a vehicle QR and shares location via a lightweight web app.', icon: <QrIcon size={18} /> },
  { value: 'MANUAL_CSV', title: 'Manual CSV upload', desc: 'Positions and trips entered or imported periodically by the station officer.', icon: <FileSpreadsheet size={18} /> }
];

const STEPS = ['Identity', 'Assignment & ownership', 'Specs & compliance', 'Tracking'];

export function RegisterWizard({
  stations,
  onClose,
  onCreated
}: {
  stations: StationView[];
  onClose: () => void;
  onCreated: (vehicle: VehicleView) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  // AI document scan: fills EMPTY fields only (never overwrites what was typed). The user verifies before saving.
  function applyScan(f: ExtractedFields, kind: ExtractKind) {
    setForm((prev) => {
      const next = { ...prev };
      const fillText = (key: 'registrationNumber' | 'makeModel' | 'fuelType' | 'chassisNumber' | 'engineNumber', v: string | null) => {
        if (v && !next[key].trim()) next[key] = v;
      };
      fillText('registrationNumber', f.registrationNumber);
      fillText('makeModel', f.makeModel);
      fillText('fuelType', f.fuelType);
      fillText('chassisNumber', f.chassisNumber);
      fillText('engineNumber', f.engineNumber);
      if (f.year && !next.year.trim()) next.year = String(f.year);
      if (f.seating && !next.seating.trim()) next.seating = String(f.seating);
      if (f.expiryDate) {
        if (kind === 'INSURANCE') next.insuranceExpiry = f.expiryDate;
        else if (kind === 'PUC') next.pucExpiry = f.expiryDate;
        else if (kind === 'FITNESS') next.fitnessExpiry = f.expiryDate;
      }
      return next;
    });
  }
  function validateStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0) {
      const reg = form.registrationNumber.trim();
      if (!reg) e.registrationNumber = 'Registration number is required.';
      else if (!REG_REGEX.test(reg)) e.registrationNumber = 'Use a format like MP07-AB-1234.';
      if (!form.displayName.trim()) e.displayName = 'Display name is required.';
      if (!form.vehicleType.trim()) e.vehicleType = 'Vehicle type is required.';
    }
    if (s === 2) {
      if (form.year && (Number(form.year) < 1950 || Number(form.year) > new Date().getFullYear() + 1))
        e.year = 'Enter a valid year.';
      if (form.odometerKm && Number(form.odometerKm) < 0) e.odometerKm = 'Odometer cannot be negative.';
      if (form.seating && Number(form.seating) < 0) e.seating = 'Seating cannot be negative.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (validateStep(step)) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    for (let s = 0; s < STEPS.length; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    const payload: VehicleInput = {
      registrationNumber: form.registrationNumber.trim().toUpperCase(),
      displayName: form.displayName.trim(),
      sector: form.sector,
      vehicleClass: form.vehicleClass,
      vehicleType: form.vehicleType.trim(),
      managingUnit: form.managingUnit.trim() || null,
      stationId: form.stationId || null,
      claimedOwnership: form.claimedOwnership,
      driverName: form.driverName.trim() || null,
      driverPhone: form.driverPhone.trim() || null,
      makeModel: form.makeModel.trim() || null,
      year: form.year ? Number(form.year) : null,
      fuelType: form.fuelType.trim() || null,
      seating: form.seating ? Number(form.seating) : null,
      chassisNumber: form.chassisNumber.trim() || null,
      engineNumber: form.engineNumber.trim() || null,
      odometerKm: form.odometerKm ? Number(form.odometerKm) : 0,
      gpsSource: form.gpsSource,
      pucExpiry: form.pucExpiry || null,
      insuranceExpiry: form.insuranceExpiry || null,
      fitnessExpiry: form.fitnessExpiry || null,
      lat: form.latitude,
      lng: form.longitude
    };
    setSaving(true);
    setServerError(null);
    try {
      const created = await api.post<VehicleView>('/api/cloud/vehicles', payload);
      toast(`Registered ${created.registrationNumber}`, 'success');
      onCreated(created);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not register vehicle';
      setServerError(message);
      toast(message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="cluster" style={{ justifyContent: 'space-between', width: '100%' }}>
      <Button variant="ghost" onClick={step === 0 ? onClose : back} disabled={saving}>
        {step === 0 ? 'Cancel' : 'Back'}
      </Button>
      {step < STEPS.length - 1 ? (
        <Button variant="primary" onClick={next}>
          Continue
        </Button>
      ) : (
        <Button variant="primary" onClick={submit} loading={saving} icon={<Check size={16} />}>
          Register vehicle
        </Button>
      )}
    </div>
  );

  return (
    <Modal title="Register vehicle" size="large" onClose={onClose} footer={footer} closeDisabled={saving}>
      <div className="veh-wizard-steps" role="tablist" aria-label="Registration steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            role="tab"
            aria-selected={i === step}
            className={`veh-wizard-step ${i === step ? 'veh-wizard-step--active' : ''} ${i < step ? 'veh-wizard-step--done' : ''}`}
          >
            <span className="veh-wizard-stepnum">{i < step ? <Check size={12} /> : <span>{i + 1}</span>}</span>
            {label}
          </div>
        ))}
      </div>

      {serverError ? (
        <div className="toast-inline toast-inline--danger" role="alert" style={{ marginBottom: '0.75rem' }}>
          <span className="toast-inline__message">{serverError}</span>
        </div>
      ) : null}

      {step === 0 && (
        <div className="stack">
          <Field label="Registration number" required error={errors.registrationNumber} hint="Tolerant format, e.g. MP07-AB-1234. Duplicates are flagged for review, never silently merged.">
            <input
              className="input mono"
              value={form.registrationNumber}
              onChange={(e) => set('registrationNumber', e.target.value)}
              placeholder="MP07-AB-1234"
              autoFocus
            />
          </Field>
          <Field label="Display name" required error={errors.displayName}>
            <input className="input" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Patrol vehicle - Thatipur" />
          </Field>
          <div className="grid-2">
            <Field label="Sector" required>
              <Select value={form.sector} onChange={(v) => set('sector', v as Sector)} options={SECTORS.map((s) => ({ value: s, label: sectorLabel(s) }))} ariaLabel="Sector" />
            </Field>
            <Field label="Class" required>
              <Select value={form.vehicleClass} onChange={(v) => set('vehicleClass', v as VehicleClass)} options={CLASSES.map((c) => ({ value: c, label: classLabel(c) }))} ariaLabel="Vehicle class" />
            </Field>
          </div>
          <Field label="Vehicle type" required error={errors.vehicleType} hint="Free text, e.g. SUV, Tipper, Bolero">
            <input className="input" value={form.vehicleType} onChange={(e) => set('vehicleType', e.target.value)} />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <Field label="Station">
            <Select
              value={form.stationId}
              onChange={(v) => set('stationId', v)}
              options={[{ value: '', label: 'Unassigned' }, ...stations.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))]}
              ariaLabel="Station"
            />
          </Field>
          <Field label="Managing unit" hint="Optional sub-unit or section responsible for the asset">
            <input className="input" value={form.managingUnit} onChange={(e) => set('managingUnit', e.target.value)} placeholder="e.g. Traffic wing" />
          </Field>
          <Field label="Claimed ownership category" required>
            <Select
              value={form.claimedOwnership}
              onChange={(v) => set('claimedOwnership', v as OwnershipCategory)}
              options={OWNERSHIP.map((o) => ({ value: o, label: OWNERSHIP_LABEL[o] }))}
              ariaLabel="Claimed ownership"
            />
          </Field>
          <div className="veh-ownership-note" role="note">
            <ShieldQuestion size={16} aria-hidden="true" />
            <p>
              This is only a <strong>claim</strong>. The vehicle stays <strong>pending verification</strong> and
              <strong> ineligible for allocation</strong> until an authorized verifier (not you) confirms ownership
              evidence. It will not become eligible just because you select “Government fleet” here.
            </p>
          </div>
          <div className="grid-2">
            <Field label="Driver name">
              <input className="input" value={form.driverName} onChange={(e) => set('driverName', e.target.value)} />
            </Field>
            <Field label="Driver phone">
              <input className="input" value={form.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} inputMode="tel" />
            </Field>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <DocumentScanPanel onApply={applyScan} />
          <div className="grid-2">
            <Field label="Make & model">
              <input className="input" value={form.makeModel} onChange={(e) => set('makeModel', e.target.value)} />
            </Field>
            <Field label="Year" error={errors.year}>
              <input className="input" value={form.year} onChange={(e) => set('year', e.target.value)} inputMode="numeric" placeholder="2021" />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="Fuel type">
              <input className="input" value={form.fuelType} onChange={(e) => set('fuelType', e.target.value)} placeholder="Diesel" />
            </Field>
            <Field label="Seating" error={errors.seating}>
              <input className="input" value={form.seating} onChange={(e) => set('seating', e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Odometer (km)" error={errors.odometerKm}>
              <input className="input" value={form.odometerKm} onChange={(e) => set('odometerKm', e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Chassis number">
              <input className="input mono" value={form.chassisNumber} onChange={(e) => set('chassisNumber', e.target.value)} />
            </Field>
            <Field label="Engine number">
              <input className="input mono" value={form.engineNumber} onChange={(e) => set('engineNumber', e.target.value)} />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="PUC expiry">
              <input className="input" type="date" value={form.pucExpiry} onChange={(e) => set('pucExpiry', e.target.value)} />
            </Field>
            <Field label="Insurance expiry">
              <input className="input" type="date" value={form.insuranceExpiry} onChange={(e) => set('insuranceExpiry', e.target.value)} />
            </Field>
            <Field label="Fitness expiry">
              <input className="input" type="date" value={form.fitnessExpiry} onChange={(e) => set('fitnessExpiry', e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <p className="text-muted" style={{ margin: 0 }}>
            Choose how this vehicle reports its location.
          </p>
          <div className="stack" role="radiogroup" aria-label="GPS source tier">
            {GPS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={form.gpsSource === o.value}
                className={`veh-gps-option ${form.gpsSource === o.value ? 'veh-gps-option--active' : ''}`}
                onClick={() => set('gpsSource', o.value)}
              >
                <span style={{ color: 'var(--brand, #0a7f8c)' }}>{o.icon}</span>
                <span>
                  <h4>{o.title}</h4>
                  <p>{o.desc}</p>
                </span>
              </button>
            ))}
          </div>

          <AddressSearch
            label="Last known position"
            hint="Optional. Choosing a suggestion stores the coordinates; typed text alone is not geocoded."
            value={form.locationAddress}
            onChange={(next) => {
              set('locationAddress', next);
              // Editing the label invalidates the coordinate picked from the old suggestion.
              set('latitude', null);
              set('longitude', null);
            }}
            onPlace={(place) => {
              set('latitude', place.lat);
              set('longitude', place.lng);
            }}
            proximity={GWALIOR_PROXIMITY}
            placeholder="Search a landmark, road or police station"
          />
          {form.latitude !== null && form.longitude !== null ? (
            <p className="address-search__readout">
              <MapPin size={13} aria-hidden="true" />
              <span className="mono">
                {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </span>
              <span>— suggested by map search, not yet verified</span>
            </p>
          ) : null}

          <div className="panel">
            <h4 style={{ margin: '0 0 0.5rem' }}>Review</h4>
            <div className="kv">
              <span>Registration</span>
              <span className="mono">{form.registrationNumber || '—'}</span>
              <span>Name</span>
              <span>{form.displayName || '—'}</span>
              <span>Sector / Class</span>
              <span>{sectorLabel(form.sector)} / {classLabel(form.vehicleClass)}</span>
              <span>Station</span>
              <span>{stations.find((s) => s.id === form.stationId)?.name ?? 'Unassigned'}</span>
              <span>Claimed ownership</span>
              <span>{OWNERSHIP_LABEL[form.claimedOwnership]} (pending verification)</span>
              <span>Tracking</span>
              <span>{GPS_OPTIONS.find((o) => o.value === form.gpsSource)?.title}</span>
              <span>Last known position</span>
              <span>{form.locationAddress.trim() || 'Not set'}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

