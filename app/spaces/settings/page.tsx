'use client';

import { useState } from 'react';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { api, ApiError } from '@/lib/client/api';
import { useApiResource } from '@/hooks/useApiResource';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import type { SpaceSettings } from '@/types';

export default function SpaceSettingsPage() {
  const { can } = useFleet();
  const canManage = can('settings.manage');
  const { data, loading, error, refetch } = useApiResource<SpaceSettings>(canManage ? '/api/cloud/space-settings' : null);

  if (!canManage) {
    return (
      <div className="page">
        <PageTitle title="Space booking policy" />
        <EmptyState title="Only platform administrators can change the booking policy" />
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageTitle title="Space booking policy" description="Platform-wide defaults for the Civic Spaces booking engine. Every change is versioned in the audit ledger." />
      {loading ? <EmptyState title="Loading policy…" /> : error ? <EmptyState title={`Could not load policy: ${error}`} action={<Button variant="secondary" onClick={refetch}>Retry</Button>} /> : data ? (
        <PolicyForm initial={data} />
      ) : null}
    </div>
  );
}

/** Local form state initializes once from the loaded policy — no effect-based syncing. */
function PolicyForm({ initial }: { initial: SpaceSettings }) {
  const { toast } = useToast();
  const [threshold, setThreshold] = useState(String(initial.approvalThresholdHours));
  const [windowDays, setWindowDays] = useState(String(initial.bookingWindowDays));
  const [idleDays, setIdleDays] = useState(String(initial.idleAlertDays));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.put('/api/cloud/space-settings', {
        approvalThresholdHours: Number(threshold),
        bookingWindowDays: Number(windowDays),
        idleAlertDays: Number(idleDays),
        reason: reason.trim() || undefined
      });
      toast('Booking policy saved', 'success');
      setReason('');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Save failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Booking rules">
      <div className="stack">
        <Field label="Auto-approval threshold (hours)" hint="Bookings at or under this duration are confirmed immediately; longer ones await review. 0 = everything requires review.">
          <input className="input" type="number" min={0} max={72} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ width: 160 }} />
        </Field>
        <Field label="Booking window (days ahead)" hint="Upper bound on how far in the future a booking may start, on top of each space's own lead time.">
          <input className="input" type="number" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} style={{ width: 160 }} />
        </Field>
        <Field label="Idle alert (days)" hint="A bookable space with no bookings for this many days appears on the dashboard as idle-for-activation.">
          <input className="input" type="number" min={1} max={365} value={idleDays} onChange={(e) => setIdleDays(e.target.value)} style={{ width: 160 }} />
        </Field>
        <Field label="Reason for change" hint="Recorded in the audit ledger next to the old and new values.">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. District review decision 42/2026" />
        </Field>
        <div className="cluster" style={{ justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={save} loading={busy}>Save policy</Button>
        </div>
        <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
          Policy changes never silently invalidate existing bookings — already-held slots stay held; only new requests are affected.
        </p>
      </div>
    </Panel>
  );
}
