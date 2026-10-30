'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { useToast } from '@/lib/client/useToast';
import { useApiResource } from '@/hooks/useApiResource';
import { fmtDateTime } from '@/lib/fleet/format';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { SpaceBookingView, SpaceView } from '@/types';

interface SpacesResponse {
  spaces: SpaceView[];
}

export function RelocateDialog({
  booking,
  onClose,
  onDone
}: {
  booking: SpaceBookingView;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [reason, setReason] = useState('Emergency maintenance relocation');
  const [busy, setBusy] = useState(false);

  // Search available candidate spaces for the booking's exact start/end window
  const url = `/api/cloud/spaces?from=${encodeURIComponent(booking.startAt)}&to=${encodeURIComponent(booking.endAt)}&availableOnly=true`;
  const { data, loading } = useApiResource<SpacesResponse>(url);
  const candidates = (data?.spaces ?? []).filter((s) => s.id !== booking.spaceId);

  async function submit() {
    if (!selectedSpaceId) return;
    setBusy(true);
    try {
      await api.post(`/api/cloud/space-bookings/${booking.id}/actions`, {
        type: 'relocate',
        targetSpaceId: selectedSpaceId,
        reason: reason.trim() || undefined
      });
      toast('Booking successfully relocated to alternative venue', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Relocation failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Relocate booking ${booking.bookingCode}`} onClose={onClose}>
      <div className="stack">
        <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Current venue: <strong>{booking.spaceName}</strong> ({booking.spaceAssetCode})
          <br />
          Slot: {fmtDateTime(booking.startAt)} → {fmtDateTime(booking.endAt)}
        </p>

        <Field label="Choose alternative available space" required>
          {loading ? (
            <p className="text-muted">Searching candidate spaces...</p>
          ) : candidates.length === 0 ? (
            <p className="text-muted">No other spaces are free for this slot.</p>
          ) : (
            <select
              className="input"
              value={selectedSpaceId}
              onChange={(e) => setSelectedSpaceId(e.target.value)}
            >
              <option value="">Select an alternative venue...</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.assetCode}) — Capacity {s.capacity} {s.buildingOrCampus ? `· ${s.buildingOrCampus}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Relocation reason">
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Electrical maintenance at Chamber Hall"
          />
        </Field>

        <div className="cluster" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!selectedSpaceId}>
            Confirm relocation
          </Button>
        </div>
      </div>
    </Modal>
  );
}

