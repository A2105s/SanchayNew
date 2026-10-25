'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import type { DeviceKind, DeviceView, VehicleView } from '@/types';

type ToastFn = (m: string, v?: 'success' | 'warning' | 'danger' | 'info') => void;

export const DEVICE_KINDS: { value: DeviceKind; label: string }[] = [
  { value: 'GPS_TRACKER', label: 'GPS tracker' },
  { value: 'OBD_DONGLE', label: 'OBD dongle' },
  { value: 'FUEL_SENSOR', label: 'Fuel sensor' },
  { value: 'SOS_BUTTON', label: 'SOS button' },
  { value: 'DASHCAM', label: 'Dashcam' },
  { value: 'TEMP_SENSOR', label: 'Temperature sensor' },
];

export const DEVICE_PROTOCOLS: { value: DeviceView['protocol']; label: string }[] = [
  { value: 'AIS_140', label: 'AIS-140' },
  { value: 'MQTT', label: 'MQTT' },
  { value: 'HTTP', label: 'HTTP' },
  { value: 'BLE', label: 'BLE' },
];

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  GPS_TRACKER: 'GPS tracker',
  OBD_DONGLE: 'OBD dongle',
  FUEL_SENSOR: 'Fuel sensor',
  SOS_BUTTON: 'SOS button',
  DASHCAM: 'Dashcam',
  TEMP_SENSOR: 'Temperature sensor',
};

export function ProvisionModal({
  vehicles,
  onClose,
  onDone,
  toast,
}: {
  vehicles: VehicleView[];
  onClose: () => void;
  onDone: () => void;
  toast: ToastFn;
}) {
  const [deviceCode, setDeviceCode] = useState('');
  const [kind, setKind] = useState<DeviceKind>('GPS_TRACKER');
  const [protocol, setProtocol] = useState<DeviceView['protocol']>('AIS_140');
  const [vehicleId, setVehicleId] = useState('');
  const [firmware, setFirmware] = useState('');
  const [simulated, setSimulated] = useState(true);
  const [saving, setSaving] = useState(false);

  const valid = deviceCode.trim().length >= 1;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await api.post('/api/cloud/devices', {
        deviceCode: deviceCode.trim(),
        kind,
        protocol,
        vehicleId: vehicleId || undefined,
        firmware: firmware.trim() || undefined,
        simulated,
      });
      toast('Device provisioned', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not provision device', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Provision device"
      size="large"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!valid} onClick={submit}>Provision</Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Device code" required hint="Unique hardware identifier (IMEI, serial)">
          <input className="input" value={deviceCode} onChange={(e) => setDeviceCode(e.target.value)} placeholder="e.g. 356938035643809" />
        </Field>
        <div className="grid-2">
          <Field label="Kind" required>
            <Select ariaLabel="Device kind" value={kind} onChange={(v) => setKind(v as DeviceKind)} options={DEVICE_KINDS} />
          </Field>
          <Field label="Protocol" required>
            <Select ariaLabel="Protocol" value={protocol} onChange={(v) => setProtocol(v as DeviceView['protocol'])} options={DEVICE_PROTOCOLS} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Bind to vehicle">
            <Select
              ariaLabel="Bind vehicle"
              value={vehicleId}
              onChange={setVehicleId}
              placeholder="Unbound"
              options={[
                { value: '', label: 'Unbound' },
                ...vehicles.map((v) => ({ value: v.id, label: `${v.registrationNumber} — ${v.displayName}` })),
              ]}
            />
          </Field>
          <Field label="Firmware">
            <input className="input" value={firmware} onChange={(e) => setFirmware(e.target.value)} placeholder="e.g. v2.4.1" />
          </Field>
        </div>
        <label className="cluster" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={simulated} onChange={(e) => setSimulated(e.target.checked)} />
          <span>Simulated placeholder device (no real hardware)</span>
        </label>
      </div>
    </Modal>
  );
}
