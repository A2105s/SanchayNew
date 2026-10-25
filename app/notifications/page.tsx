'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useFleet } from '@/lib/client/useFleet';
import { useToast } from '@/lib/client/useToast';
import { fmtRelative } from '@/lib/fleet/format';
import { PageTitle } from '@/components/ui/PageTitle';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { NotificationView } from '@/types';

export default function NotificationsPage() {
  const { refresh } = useFleet();
  const { toast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.get<NotificationView[]>('/api/cloud/notifications'));
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : 'Could not load notifications.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kinds = useMemo(() => [...new Set((items ?? []).map((n) => n.kind))].sort(), [items]);
  const visible = useMemo(
    () =>
      (items ?? [])
        .filter((n) => !kind || n.kind === kind)
        .sort((a, b) => Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)) || b.createdAt.localeCompare(a.createdAt)),
    [items, kind]
  );
  const unread = (items ?? []).filter((n) => !n.readAt).length;

  async function mark(ids: string[] | 'all') {
    setBusy(true);
    try {
      await api.post('/api/cloud/notifications/read', { ids });
      await Promise.all([load(), refresh()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update notifications.', 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function open(n: NotificationView) {
    if (!n.readAt) await mark([n.id]);
    if (n.href) router.push(n.href);
  }

  return (
    <div className="page">
      <PageTitle
        title="Notifications"
        description="Created after a decision is saved, so you only see things that really happened."
        action={
          <Button variant="secondary" icon={<CheckCheck size={15} />} disabled={busy || unread === 0} onClick={() => mark('all')}>
            Mark all read
          </Button>
        }
      />
      {kinds.length > 1 ? (
        <div className="toolbar">
          <Select value={kind} onChange={setKind} options={[{ value: '', label: 'All types' }, ...kinds.map((k) => ({ value: k, label: k.replace(/_/g, ' ').toLowerCase() }))]} ariaLabel="Filter by type" width="220px" />
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>{unread} unread</span>
        </div>
      ) : null}

      {items === null ? (
        <div className="stack">
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : error ? (
        <EmptyState icon={<BellOff size={28} />} title="Could not load notifications" description={error} action={<Button onClick={() => void load()}>Retry</Button>} />
      ) : visible.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} title="You are all caught up" description="Approvals, returns, incidents and handovers that need you will appear here." />
      ) : (
        <ul className="an-queue" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {visible.map((n) => (
            <li className="an-queue__item" key={n.id}>
              <button type="button" className="an-queue__link" style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', opacity: n.readAt ? 0.72 : 1 }} onClick={() => void open(n)}>
                <span className="an-queue__title">
                  <strong>{n.title}</strong>
                  <small>{n.body}</small>
                </span>
                <span className="an-queue__status">
                  {!n.readAt ? <Badge tone="brand">New</Badge> : <Badge tone="neutral">Read</Badge>}
                  <small>{fmtRelative(n.createdAt)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
