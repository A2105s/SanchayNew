'use client';

import { useState } from 'react';
import { ShieldAlert, Save, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { api, ApiError } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import { useFleet } from '@/lib/client/useFleet';
import { VEHICLE_CLASSIFICATIONS } from '@/lib/fleet/classification';
import type { SeizedVehicleInput, StationView, VehicleClass, VehicleView } from '@/types';

interface RegisterSeizedModalProps {
  stations: StationView[];
  onClose: () => void;
  onDone: (vehicle: VehicleView) => void;
}

export function RegisterSeizedModal({ stations, onClose, onDone }: RegisterSeizedModalProps) {
  const { me } = useFleet();
  const { toast } = useToast();

  const isStationOfficer = Boolean(me?.stationId && me?.role !== 'ADMIN');
  const defaultStationId = me?.stationId ?? (stations[0]?.id || '');

  const [regNum, setRegNum] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('CAR');
  const [vehicleType, setVehicleType] = useState('Impounded Vehicle');
  const [makeModel, setMakeModel] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [stationId, setStationId] = useState(defaultStationId);
  const [seizureDate, setSeizureDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [seizureLocation, setSeizureLocation] = useState('');
  const [firNumber, setFirNumber] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [custodyLocation, setCustodyLocation] = useState('Station Malkhana / Vehicle Yard');
  const [remarks, setRemarks] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!displayName.trim()) errs.displayName = 'Vehicle label / description is required.';
    if (!stationId) errs.stationId = 'Police station is required.';
    if (!firNumber.trim()) errs.firNumber = 'FIR Number or Case Crime Number (CCN) is required.';
    if (!seizureLocation.trim()) errs.seizureLocation = 'Seizure location is required.';
    if (!custodyLocation.trim()) errs.custodyLocation = 'Storage / custody location is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: SeizedVehicleInput = {
        registrationNumber: regNum.trim() || undefined,
        displayName: displayName.trim(),
        vehicleClass,
        vehicleType: vehicleType.trim() || 'Impounded Vehicle',
        makeModel: makeModel.trim() || undefined,
        chassisNumber: chassisNumber.trim() || undefined,
        engineNumber: engineNumber.trim() || undefined,
        stationId,
        seizureDate: new Date(seizureDate).toISOString(),
        seizureLocation: seizureLocation.trim(),
        firNumber: firNumber.trim(),
        evidenceRef: evidenceRef.trim() || undefined,
        custodyLocation: custodyLocation.trim(),
        remarks: remarks.trim() || undefined
      };

      const res = await api.post<VehicleView>('/api/cloud/vehicles/seized', payload);
      toast(`Seized vehicle registered (${res.assetCode}) under police custody`, 'success');
      onDone(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Registration failed';
      toast(msg, 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Register Seized / Impounded Vehicle"
      size="large"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Save size={16} />}
            loading={saving}
            onClick={() => void handleSubmit()}
          >
            Register into Custody
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="stack">
        <div className="toast-inline toast-inline--warning" role="note" style={{ fontSize: '0.82rem' }}>
          <ShieldAlert size={16} className="toast-inline__icon" aria-hidden="true" />
          <span className="toast-inline__message">
            Seized vehicles are registered in <strong>Police Custody (IN_CUSTODY)</strong> with an active legal restriction.
            They will <strong>not</strong> enter the allocatable fleet until formal legal clearance and administrative approval.
          </span>
        </div>

        <div className="grid-2">
          <Field label="Registration number" hint="Optional if vehicle plate is missing or unverified">
            <input
              className="input mono"
              value={regNum}
              onChange={(e) => setRegNum(e.target.value.toUpperCase())}
              placeholder="e.g. MP07-AB-1234 (optional)"
            />
          </Field>
          <Field label="Vehicle label / display name" required error={errors.displayName}>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. White Maruti Swift (Impounded)"
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Vehicle class & machinery" required>
            <Select
              value={vehicleClass}
              onChange={(v) => setVehicleClass(v as VehicleClass)}
              options={VEHICLE_CLASSIFICATIONS.map((c) => ({
                value: c.key,
                label: `${c.label} (${c.categoryLabel})`
              }))}
              ariaLabel="Vehicle class"
            />
          </Field>
          <Field label="Make & model">
            <input
              className="input"
              value={makeModel}
              onChange={(e) => setMakeModel(e.target.value)}
              placeholder="e.g. Hyundai Creta 2021 / JCB 3DX"
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Chassis number">
            <input
              className="input mono"
              value={chassisNumber}
              onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
              placeholder="VIN / Chassis identification"
            />
          </Field>
          <Field label="Engine number">
            <input
              className="input mono"
              value={engineNumber}
              onChange={(e) => setEngineNumber(e.target.value.toUpperCase())}
              placeholder="Engine serial number"
            />
          </Field>
        </div>

        <div className="grid-2">
          {isStationOfficer ? (
            <Field label="Seizing police station" hint="Assigned police station of logged-in officer" required>
              <input
                className="input"
                disabled
                readOnly
                value={stations.find((s) => s.id === stationId)?.name ?? 'Your Assigned Station'}
              />
            </Field>
          ) : (
            <Field label="Seizing police station" required error={errors.stationId}>
              <Select
                value={stationId}
                onChange={setStationId}
                options={stations.map((s) => ({ value: s.id, label: s.name }))}
                ariaLabel="Select police station"
              />
            </Field>
          )}

          <Field label="Date of seizure" required>
            <input
              className="input"
              type="date"
              value={seizureDate}
              onChange={(e) => setSeizureDate(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="FIR number / Case reference" required error={errors.firNumber}>
            <input
              className="input"
              value={firNumber}
              onChange={(e) => setFirNumber(e.target.value)}
              placeholder="e.g. FIR 142/2026 u/s 379 IPC"
            />
          </Field>
          <Field label="Seizure location / checkpost" required error={errors.seizureLocation}>
            <input
              className="input"
              value={seizureLocation}
              onChange={(e) => setSeizureLocation(e.target.value)}
              placeholder="e.g. Padav Tiraha / Naka Point"
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Current custody / storage yard" required error={errors.custodyLocation}>
            <input
              className="input"
              value={custodyLocation}
              onChange={(e) => setCustodyLocation(e.target.value)}
              placeholder="e.g. Police Line Malkhana Yard #2"
            />
          </Field>
          <Field label="Supporting evidence / panchnama ref">
            <input
              className="input"
              value={evidenceRef}
              onChange={(e) => setEvidenceRef(e.target.value)}
              placeholder="e.g. Seizure memo doc ref #8812"
            />
          </Field>
        </div>

        <Field label="Case remarks & vehicle condition notes">
          <textarea
            className="textarea"
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Vehicle physical condition, key availability, case remarks..."
          />
        </Field>
      </form>
    </Modal>
  );
}

