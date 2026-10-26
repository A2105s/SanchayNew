'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PolishButton } from '@/components/ai/PolishButton';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { AddressSearch } from '@/components/maps/AddressSearch';
import { api } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import type {
  IncidentView,
  LegalRecordView,
  MaintenanceSeverity,
  MaintenanceStatus,
  VehicleAction,
  VehicleView,
} from '@/types';

/** Gwalior city centre - biases address suggestions toward the fleet's operating area. */
const GWALIOR_PROXIMITY = { lat: 26.2183, lng: 78.1828 };

async function runAction(vehicleId: string, action: VehicleAction) {
  return api.post<{ vehicle: VehicleView } & Record<string, unknown>>(`/api/cloud/vehicles/${vehicleId}/actions`, action);
}

function footer(onClose: () => void, onSubmit: () => void, saving: boolean, label = 'Save') {
  return (
    <div className="cluster" style={{ justifyContent: 'flex-end', width: '100%' }}>
      <Button variant="ghost" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" onClick={onSubmit} loading={saving}>
        {label}
      </Button>
    </div>
  );
}

/* ---- Renew compliance ---- */
export function RenewComplianceModal({
  vehicleId,
  document,
  onClose,
  onDone,
}: {
  vehicleId: string;
  document: 'PUC' | 'INSURANCE' | 'FITNESS';
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [newExpiry, setNewExpiry] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!newExpiry) {
      toast('Select a new expiry date', 'warning');
      return;
    }
    setSaving(true);
    try {
      await runAction(vehicleId, { type: 'renewCompliance', document, newExpiry, reference: reference || undefined });
      toast(`${document} renewed`, 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Renew failed', 'danger');
    } finally {
      setSaving(false);
    }
  }

  const label = document === 'PUC' ? 'PUC certificate' : document === 'INSURANCE' ? 'insurance' : 'fitness certificate';
  return (
    <Modal title={`Renew ${label}`} onClose={onClose} closeDisabled={saving} footer={footer(onClose, submit, saving, 'Renew')}>
      <div className="stack">
        <Field label="New expiry date" required>
          <input className="input" type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />
        </Field>
        <Field label="Reference / policy number">
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- Start trip ---- */
export function StartTripModal({
  vehicle,
  onClose,
  onDone,
}: {
  vehicle: VehicleView;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [driverName, setDriverName] = useState(vehicle.driverName ?? '');
  const [purpose, setPurpose] = useState('');
  const [startAddress, setStartAddress] = useState('');
  const [startOdometer, setStartOdometer] = useState(String(vehicle.odometerKm));
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!driverName.trim() || !purpose.trim() || !startAddress.trim()) {
      toast('Driver, purpose and start location are required', 'warning');
      return;
    }
    setSaving(true);
    try {
      await runAction(vehicle.id, {
        type: 'startTrip',
        driverName: driverName.trim(),
        purpose: purpose.trim(),
        startAddress: startAddress.trim(),
        startOdometer: Number(startOdometer) || vehicle.odometerKm,
      });
      toast('Trip started', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start trip', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Start trip" onClose={onClose} closeDisabled={saving} footer={footer(onClose, submit, saving, 'Start trip')}>
      <div className="stack">
        <Field label="Driver" required>
          <input className="input" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </Field>
        <Field label="Purpose" required>
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        <AddressSearch
          label="Start location"
          required
          value={startAddress}
          onChange={setStartAddress}
          proximity={GWALIOR_PROXIMITY}
          placeholder="Search a landmark, road or police station"
        />
        <Field label="Start odometer (km)" required>
          <input className="input" inputMode="numeric" value={startOdometer} onChange={(e) => setStartOdometer(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- End trip ---- */
export function EndTripModal({
  vehicleId,
  tripId,
  startOdometer,
  onClose,
  onDone,
}: {
  vehicleId: string;
  tripId: string;
  startOdometer: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [endAddress, setEndAddress] = useState('');
  const [endOdometer, setEndOdometer] = useState('');
  const [fuelLiters, setFuelLiters] = useState('');
  const [saving, setSaving] = useState(false);
  const odoNum = Number(endOdometer);
  const odoError = endOdometer && odoNum <= startOdometer ? `Must be greater than start (${startOdometer} km)` : undefined;

  async function submit() {
    if (!endAddress.trim()) {
      toast('End location is required', 'warning');
      return;
    }
    if (!endOdometer || odoError) {
      toast(odoError ?? 'Enter end odometer', 'warning');
      return;
    }
    setSaving(true);
    try {
      await runAction(vehicleId, {
        type: 'endTrip',
        tripId,
        endAddress: endAddress.trim(),
        endOdometer: odoNum,
        fuelLiters: fuelLiters ? Number(fuelLiters) : undefined,
      });
      toast('Trip completed', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not end trip', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="End trip" onClose={onClose} closeDisabled={saving} footer={footer(onClose, submit, saving, 'End trip')}>
      <div className="stack">
        <AddressSearch
          label="End location"
          required
          value={endAddress}
          onChange={setEndAddress}
          proximity={GWALIOR_PROXIMITY}
          placeholder="Search a landmark, road or police station"
        />
        <Field label="End odometer (km)" required error={odoError}>
          <input className="input" inputMode="numeric" value={endOdometer} onChange={(e) => setEndOdometer(e.target.value)} />
        </Field>
        <Field label="Fuel added (litres)">
          <input className="input" inputMode="decimal" value={fuelLiters} onChange={(e) => setFuelLiters(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- Raise maintenance ---- */
const SEVERITIES: MaintenanceSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export function RaiseMaintenanceModal({
  vehicleId,
  onClose,
  onDone,
}: {
  vehicleId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<MaintenanceSeverity>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) {
      toast('Title is required', 'warning');
      return;
    }
    setSaving(true);
    try {
      await runAction(vehicleId, {
        type: 'raiseMaintenance',
        title: title.trim(),
        severity,
        dueDate: dueDate || undefined,
        vendor: vendor || undefined,
        notes: notes || undefined,
      });
      toast('Maintenance ticket raised', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not raise ticket', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Raise maintenance ticket" onClose={onClose} closeDisabled={saving} footer={footer(onClose, submit, saving, 'Raise ticket')}>
      <div className="stack">
        <Field label="Title" required>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brake pad replacement" />
        </Field>
        <div className="grid-2">
          <Field label="Severity" required>
            <Select value={severity} onChange={(v) => setSeverity(v as MaintenanceSeverity)} options={SEVERITIES.map((s) => ({ value: s, label: s }))} ariaLabel="Severity" />
          </Field>
          <Field label="Due date">
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Vendor">
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          <PolishButton kind="maintenance" value={notes} onApply={setNotes} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- Update maintenance ---- */
const MAINT_STATUSES: MaintenanceStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED'];
export function UpdateMaintenanceModal({
  vehicleId,
  ticketId,
  onClose,
  onDone,
}: {
  vehicleId: string;
  ticketId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<MaintenanceStatus>('IN_PROGRESS');
  const [costInr, setCostInr] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await runAction(vehicleId, {
        type: 'updateMaintenance',
        ticketId,
        status,
        costInr: costInr ? Number(costInr) : undefined,
        notes: notes || undefined,
      });
      toast('Ticket updated', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Update maintenance ticket" onClose={onClose} closeDisabled={saving} footer={footer(onClose, submit, saving, 'Update')}>
      <div className="stack">
        <Field label="Status" required>
          <Select value={status} onChange={(v) => setStatus(v as MaintenanceStatus)} options={MAINT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))} ariaLabel="Status" />
        </Field>
        <Field label="Cost (INR)">
          <input className="input" inputMode="numeric" value={costInr} onChange={(e) => setCostInr(e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          <PolishButton kind="maintenance" value={notes} onApply={setNotes} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- Log incident (incl SOS) ---- */
const INCIDENT_TYPES: IncidentView['type'][] = ['SOS', 'BREAKDOWN', 'ACCIDENT', 'DAMAGE', 'GEOFENCE', 'OTHER'];
const INCIDENT_SEV: IncidentView['severity'][] = ['INFO', 'WARNING', 'CRITICAL'];
export function LogIncidentModal({
  vehicleId,
  onClose,
  onDone,
}: {
  vehicleId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [incidentType, setIncidentType] = useState<IncidentView['type']>('BREAKDOWN');
  const [severity, setSeverity] = useState<IncidentView['severity']>('WARNING');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(asSos = false) {
    const type = asSos ? 'SOS' : incidentType;
    const sev = asSos ? 'CRITICAL' : severity;
    const msg = message.trim() || (asSos ? 'SOS triggered' : '');
    if (!msg) {
      toast('Enter an incident message', 'warning');
      return;
    }
    setSaving(true);
    try {
      await runAction(vehicleId, { type: 'logIncident', incidentType: type, severity: sev, message: msg });
      toast(asSos ? 'SOS raised' : 'Incident logged', asSos ? 'danger' : 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not log incident', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Log incident"
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <div className="cluster" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Button variant="danger" onClick={() => submit(true)} loading={saving}>
            Raise SOS
          </Button>
          <div className="cluster">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => submit(false)} loading={saving}>
              Log incident
            </Button>
          </div>
        </div>
      }
    >
      <div className="stack">
        <div className="grid-2">
          <Field label="Type" required>
            <Select value={incidentType} onChange={(v) => setIncidentType(v as IncidentView['type'])} options={INCIDENT_TYPES.map((t) => ({ value: t, label: t }))} ariaLabel="Incident type" />
          </Field>
          <Field label="Severity" required>
            <Select value={severity} onChange={(v) => setSeverity(v as IncidentView['severity'])} options={INCIDENT_SEV.map((s) => ({ value: s, label: s }))} ariaLabel="Severity" />
          </Field>
        </div>
        <Field label="Message" required>
          <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
          <PolishButton kind="incident" value={message} onApply={setMessage} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- Log fuel ---- */
export function LogFuelModal({
  vehicleId,
  onClose,
  onDone,
}: {
  vehicleId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [liters, setLiters] = useState('');
  const [costInr, setCostInr] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!liters || Number(liters) <= 0) {
      toast('Enter litres fuelled', 'warning');
      return;
    }
    setSaving(true);
    try {
      await runAction(vehicleId, {
        type: 'logFuel',
        liters: Number(liters),
        costInr: costInr ? Number(costInr) : undefined,
        odometerKm: odometerKm ? Number(odometerKm) : undefined,
      });
      toast('Fuel logged', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not log fuel', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Log fuel" onClose={onClose} closeDisabled={saving} footer={footer(onClose, submit, saving, 'Log fuel')}>
      <div className="stack">
        <Field label="Litres" required>
          <input className="input" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label="Cost (INR)">
            <input className="input" inputMode="numeric" value={costInr} onChange={(e) => setCostInr(e.target.value)} />
          </Field>
          <Field label="Odometer (km)">
            <input className="input" inputMode="numeric" value={odometerKm} onChange={(e) => setOdometerKm(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---- Legal record add/update ---- */
const LEGAL_TYPES: LegalRecordView['type'][] = ['CHALLAN', 'COURT_CASE', 'ACCIDENT', 'SEIZURE'];
const LEGAL_STATUS: LegalRecordView['status'][] = ['PENDING', 'ACTIVE', 'APPEALED', 'RESOLVED'];
export function LegalRecordModal({
  vehicleId,
  existing,
  onClose,
  onDone,
}: {
  vehicleId: string;
  existing?: LegalRecordView;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<LegalRecordView['type']>(existing?.type ?? 'CHALLAN');
  const [referenceNo, setReferenceNo] = useState(existing?.referenceNo ?? '');
  const [date, setDate] = useState(existing?.date?.slice(0, 10) ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [status, setStatus] = useState<LegalRecordView['status']>(existing?.status ?? 'PENDING');
  const [amountInr, setAmountInr] = useState(existing?.amountInr != null ? String(existing.amountInr) : '');
  const [authority, setAuthority] = useState(existing?.authority ?? '');
  const [nextActionAt, setNextActionAt] = useState(existing?.nextActionAt?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      if (existing) {
        await runAction(vehicleId, {
          type: 'updateLegalRecord',
          recordId: existing.id,
          status,
          nextActionAt: nextActionAt || null,
        });
      } else {
        if (!referenceNo.trim() || !date || !description.trim() || !authority.trim()) {
          toast('Reference, date, description and authority are required', 'warning');
          setSaving(false);
          return;
        }
        await runAction(vehicleId, {
          type: 'addLegalRecord',
          record: {
            type,
            referenceNo: referenceNo.trim(),
            date,
            description: description.trim(),
            status,
            amountInr: amountInr ? Number(amountInr) : null,
            nextActionAt: nextActionAt || null,
            authority: authority.trim(),
          },
        });
      }
      toast(existing ? 'Legal record updated' : 'Legal record added', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={existing ? 'Update legal record' : 'Add legal record'} onClose={onClose} closeDisabled={saving} footer={footer(onClose, submit, saving, existing ? 'Update' : 'Add')}>
      <div className="stack">
        {!existing && (
          <>
            <div className="grid-2">
              <Field label="Type" required>
                <Select value={type} onChange={(v) => setType(v as LegalRecordView['type'])} options={LEGAL_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))} ariaLabel="Legal type" />
              </Field>
              <Field label="Reference number" required>
                <input className="input mono" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Date" required>
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Amount (INR)">
                <input className="input" inputMode="numeric" value={amountInr} onChange={(e) => setAmountInr(e.target.value)} />
              </Field>
            </div>
            <Field label="Description" required>
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </Field>
            <Field label="Authority" required>
              <input className="input" value={authority} onChange={(e) => setAuthority(e.target.value)} />
            </Field>
          </>
        )}
        <div className="grid-2">
          <Field label="Status" required>
            <Select value={status} onChange={(v) => setStatus(v as LegalRecordView['status'])} options={LEGAL_STATUS.map((s) => ({ value: s, label: s }))} ariaLabel="Status" />
          </Field>
          <Field label="Next action date">
            <input className="input" type="date" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
