'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, LoaderCircle, Save, Send } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PolishButton } from '@/components/ai/PolishButton';
import { DraftRequestPanel } from '@/components/ai/DraftRequestPanel';
import type { DraftCandidate, DraftRequestFields } from '@/types/ai';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { AvailabilityBadge } from '@/components/ui/StatusBadges';
import { api, ApiError, newIdempotencyKey } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import { useFleet } from '@/lib/client/useFleet';
import { VEHICLE_CLASSIFICATIONS } from '@/lib/fleet/classification';
import type { AssetRequestView, AvailabilityView, VehicleClass, RequestInput, VehicleSearchResult } from '@/types';

const CLASSES: VehicleClass[] = VEHICLE_CLASSIFICATIONS.map((c) => c.key);

export interface RequestWizardPrefill {
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  providerStationId?: string | null;
  requestedClass?: VehicleClass;
  quantity?: number;
  from?: string;
  to?: string;
}

function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RequestWizard({
  prefill,
  onClose,
  onDone
}: {
  prefill?: RequestWizardPrefill;
  onClose: () => void;
  onDone: (request: AssetRequestView) => void;
}) {
  const { toast } = useToast();
  const { me, snapshot, stationById } = useFleet();
  const userStation = me?.stationId ? (stationById(me.stationId) ?? snapshot?.stations.find((s) => s.id === me.stationId)) : null;
  const stationPhone = userStation?.phone ?? null;

  const [vehicleId, setVehicleId] = useState<string | null>(prefill?.vehicleId ?? null);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(prefill?.vehicleLabel ?? null);
  const [providerStationId, setProviderStationId] = useState<string>(prefill?.providerStationId ?? '');
  const [quantity, setQuantity] = useState<string>(String(prefill?.quantity ?? 1));
  const [requestedClass, setRequestedClass] = useState<VehicleClass>(prefill?.requestedClass ?? 'PATROL_CAR');
  const [purpose, setPurpose] = useState('');
  const [destination, setDestination] = useState('');
  const [passengers, setPassengers] = useState('1');
  const [startAt, setStartAt] = useState(toLocalInput(prefill?.from));
  const [endAt, setEndAt] = useState(toLocalInput(prefill?.to));
  const [accountableOfficer, setAccountableOfficer] = useState('');
  const [accountablePhone, setAccountablePhone] = useState('');
  const [contactPhone, setContactPhone] = useState(stationPhone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (stationPhone) {
      setContactPhone(stationPhone);
    }
  }, [stationPhone]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | 'draft' | 'submit'>(null);
  const [availability, setAvailability] = useState<AvailabilityView | null>(null);
  const [checking, setChecking] = useState(false);
  // AI draft: pre-fills the form only. The user reviews and submits; nothing is sent by the AI.
  function applyDraft(d: DraftRequestFields) {
    setRequestedClass(d.requestedClass);
    setPurpose(d.purpose);
    setDestination(d.destination ?? '');
    setPassengers(String(d.passengers));
    if (d.startAt) setStartAt(toLocalInput(d.startAt));
    if (d.endAt) setEndAt(toLocalInput(d.endAt));
    if (d.accountableOfficer) setAccountableOfficer(d.accountableOfficer);
    setAvailability(null);
  }
  function pickDraftVehicle(c: DraftCandidate, d: DraftRequestFields) {
    setVehicleId(c.vehicleId);
    setVehicleLabel(`${c.label} (${c.organizationName})`);
    setRequestedClass(d.requestedClass);
  }

  const startIso = useMemo(() => (startAt ? new Date(startAt).toISOString() : ''), [startAt]);
  const endIso = useMemo(() => (endAt ? new Date(endAt).toISOString() : ''), [endAt]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!purpose.trim()) e.purpose = 'Purpose is required.';
    if (!startAt) e.startAt = 'Start date/time is required.';
    if (!endAt) e.endAt = 'End date/time is required.';
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) e.endAt = 'End must be after start.';
    if (startAt && new Date(startAt).getTime() < Date.now() - 60_000) e.startAt = 'Start cannot be in the past.';
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) e.quantity = 'Quantity must be a positive integer (at least 1).';
    if (providerStationId && me?.stationId && providerStationId === me.stationId) {
      e.providerStationId = 'A station cannot request vehicles from itself.';
    }
    const p = Number(passengers);
    if (!Number.isFinite(p) || p < 0) e.passengers = 'Enter a valid passenger count.';
    if (!accountableOfficer.trim()) e.accountableOfficer = 'Accountable officer name is required.';
    if (!accountablePhone.trim()) {
      e.accountablePhone = "Accountable officer's phone number is mandatory.";
    } else {
      const digits = accountablePhone.replace(/\D/g, '');
      if (digits.length < 10) {
        e.accountablePhone = 'Enter a valid 10-digit phone number.';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function checkAvailability() {
    if (!vehicleId || !startIso || !endIso) return;
    setChecking(true);
    setAvailability(null);
    try {
      const sp = new URLSearchParams({ scope: 'discover', from: startIso, to: endIso, pageSize: '1', q: '' });
      const res = await api.get<VehicleSearchResult>(`/api/cloud/vehicles/search?${sp.toString()}`);
      const match = res.items.find((v) => v.id === vehicleId);
      if (match && 'availability' in match) setAvailability((match as { availability: AvailabilityView }).availability);
    } catch {
      /* availability check is advisory; final check happens on approval */
    } finally {
      setChecking(false);
    }
  }

  function buildInput(submit: boolean): RequestInput {
    return {
      vehicleId: vehicleId ?? null,
      providerStationId: providerStationId || undefined,
      requestedClass,
      quantity: Number(quantity) || 1,
      purpose: purpose.trim(),
      destination: destination.trim() || undefined,
      passengers: Number(passengers) || 0,
      startAt: startIso,
      endAt: endIso,
      accountableOfficer: accountableOfficer.trim(),
      accountablePhone: accountablePhone.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      submit
    };
  }

  async function save(mode: 'draft' | 'submit') {
    if (mode === 'submit' && !validate()) return;
    if (mode === 'draft' && !purpose.trim()) {
      setErrors({ purpose: 'Add a purpose before saving a draft.' });
      return;
    }
    setSaving(mode);
    setServerError(null);
    try {
      // A fresh Idempotency-Key per submit attempt (spec 16).
      const headers = mode === 'submit' ? { 'Idempotency-Key': newIdempotencyKey() } : undefined;
      const created = await api.post<AssetRequestView>('/api/cloud/requests', buildInput(mode === 'submit'), { headers });
      toast(mode === 'submit' ? `Request ${created.requestCode} submitted` : 'Draft saved', 'success');
      onDone(created);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not save request.';
      setServerError(message);
      toast(message, 'danger');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal
      title="New vehicle request"
      size="large"
      onClose={onClose}
      closeDisabled={saving !== null}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving !== null}>
            Cancel
          </Button>
          <Button variant="ghost" icon={<Save size={16} />} onClick={() => save('draft')} loading={saving === 'draft'} disabled={saving === 'submit'}>
            Save draft
          </Button>
          <Button variant="primary" icon={<Send size={16} />} onClick={() => save('submit')} loading={saving === 'submit'} disabled={saving === 'draft'}>
            Submit
          </Button>
        </>
      }
    >
      <div className="stack">
        {serverError ? (
          <div className="toast-inline toast-inline--danger" role="alert">
            <span className="toast-inline__message">{serverError}</span>
          </div>
        ) : null}

        <div className="panel" style={{ padding: '0.75rem 1rem' }}>
          {vehicleId ? (
            <p style={{ margin: 0 }}>
              Requesting a specific vehicle: <strong>{vehicleLabel ?? 'Selected vehicle'}</strong>. Availability is
              re-checked by the server at approval time.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              Requesting by class only. An approver will assign a specific eligible vehicle.
            </p>
          )}
        </div>

        {!vehicleId ? (
          <Field label="Requested class" required>
            <Select
              value={requestedClass}
              onChange={(v) => setRequestedClass(v as VehicleClass)}
              options={VEHICLE_CLASSIFICATIONS.map((c) => ({
                value: c.key,
                label: `${c.label} (${c.categoryLabel})`
              }))}
              ariaLabel="Requested class"
            />
          </Field>
        ) : null}

        <div className="grid-2">
          <Field label="Providing police station" error={errors.providerStationId}>
            <Select
              value={providerStationId}
              onChange={(v) => setProviderStationId(v)}
              options={[
                { value: '', label: 'Select provider police station…' },
                ...(snapshot?.stations ?? [])
                  .filter((s) => s.id !== me?.stationId)
                  .map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.zone} Zone)`
                  }))
              ]}
              ariaLabel="Providing police station"
            />
          </Field>
          <Field label="Quantity" required error={errors.quantity}>
            <input
              className="input"
              type="number"
              min="1"
              max="50"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 3"
            />
          </Field>
        </div>

        {providerStationId ? (() => {
          const prov = snapshot?.stations.find((s) => s.id === providerStationId);
          const avail = prov?.inventory?.[requestedClass] ?? 0;
          return (
            <div
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: avail > 0 ? '#f0fdf4' : '#fef2f2',
                border: avail > 0 ? '1px solid #bbf7d0' : '1px solid #fecaca',
                color: avail > 0 ? '#166534' : '#991b1b',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>{prov?.name ?? 'Provider station'}:</span>
              <span>{avail} {requestedClass.toLowerCase().replace(/_/g, ' ')}(s) currently available for sharing</span>
            </div>
          );
        })() : null}

        <DraftRequestPanel onApply={applyDraft} onPickVehicle={pickDraftVehicle} />

        <Field label="Purpose" required error={errors.purpose}>
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. VIP escort duty" />
          <PolishButton kind="request-purpose" value={purpose} onApply={setPurpose} />
        </Field>
        <div className="grid-2">
          <Field label="Destination / area">
            <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </Field>
          <Field label="Passengers" error={errors.passengers}>
            <input className="input" value={passengers} onChange={(e) => setPassengers(e.target.value)} inputMode="numeric" />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Start" required error={errors.startAt}>
            <input className="input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="End" required error={errors.endAt}>
            <input className="input" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} onBlur={() => void checkAvailability()} />
          </Field>
        </div>

        {vehicleId ? (
          <div className="cluster" style={{ gap: '0.5rem', alignItems: 'center' }}>
            <Button variant="secondary" size="sm" onClick={() => void checkAvailability()} disabled={!startIso || !endIso || checking}>
              {checking ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              Check availability
            </Button>
            {availability ? <AvailabilityBadge availability={availability} /> : null}
            {availability && availability.reasons.length ? (
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>{availability.reasons.join(' · ')}</span>
            ) : null}
          </div>
        ) : null}

        <div className="grid-2">
          <Field label="Accountable officer" required error={errors.accountableOfficer}>
            <input className="input" value={accountableOfficer} onChange={(e) => setAccountableOfficer(e.target.value)} />
          </Field>
          <Field label="Accountable officer phone" required error={errors.accountablePhone}>
            <input className="input" value={accountablePhone} onChange={(e) => setAccountablePhone(e.target.value)} inputMode="tel" placeholder="10-digit mobile number" />
          </Field>
        </div>
        <Field
          label="Contact phone"
          hint={stationPhone ? `Auto-populated from ${userStation?.name ?? 'police station'} registered records` : undefined}
        >
          <input
            className="input"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            disabled={Boolean(stationPhone)}
            inputMode="tel"
            placeholder={stationPhone ? undefined : 'Station or landline contact number'}
          />
        </Field>
      </div>
    </Modal>
  );
}
