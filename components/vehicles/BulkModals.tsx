'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { api, ApiError } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import type { StationView, VehicleBulkAction } from '@/types';

export function BulkReassignModal({
  ids,
  stations,
  onClose,
  onDone
}: {
  ids: string[];
  stations: StationView[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!stationId) {
      setError('Select a destination station.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const action: VehicleBulkAction = { type: 'reassignStation', ids, stationId };
      await api.post('/api/cloud/vehicles/bulk', action);
      toast(`Reassigned ${ids.length} vehicle${ids.length === 1 ? '' : 's'}`, 'success');
      onDone();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Reassign failed';
      setError(message);
      toast(message, 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Reassign ${ids.length} vehicle${ids.length === 1 ? '' : 's'}`}
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Reassign
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Destination station" required error={error ?? undefined}>
          <Select
            value={stationId}
            onChange={(v) => {
              setStationId(v);
              setError(null);
            }}
            options={stations.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            ariaLabel="Destination station"
          />
        </Field>
      </div>
    </Modal>
  );
}
