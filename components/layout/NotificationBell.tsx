'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, LoaderCircle, X } from 'lucide-react';
import { useFleet } from '@/components/providers/FleetProvider';
import { api, ApiError } from '@/lib/client/api';
import { fmtRelative } from '@/lib/fleet/format';
import type { NotificationView } from '@/types';

export function NotificationBell() {
  const { unreadNotifications, refresh } = useFleet();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const count = unreadNotifications;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<NotificationView[]>('/api/cloud/notifications');
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(err instanceof Error ? err.message : 'Could not load notifications.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function markAllRead() {
    const unreadIds = (items ?? []).filter((n) => !n.readAt).map((n) => n.id);
    if (!unreadIds.length) return;
    setMarking(true);
    try {
      await api.post('/api/cloud/notifications/read', { ids: unreadIds });
      // Authoritative state: re-fetch list and snapshot count.
      await load();
      await refresh();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setError(err instanceof Error ? err.message : 'Could not mark notifications read.');
      }
    } finally {
      setMarking(false);
    }
  }

  async function markOneRead(id: string) {
    try {
      await api.post('/api/cloud/notifications/read', { ids: [id] });
      await load();
      await refresh();
    } catch {
      /* non-fatal; list stays as-is */
    }
  }

  const unreadInList = (items ?? []).filter((n) => !n.readAt).length;

  return (
    <div className="notif" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button notif__trigger"
        aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={16} aria-hidden="true" />
        {count > 0 ? (
          <span className="notif__count" aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notif__panel" id={panelId} role="dialog" aria-label="Notifications">
          <header className="notif__head">
            <strong>Notifications</strong>
            <div className="notif__head-actions">
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={markAllRead}
                disabled={marking || unreadInList === 0}
                aria-label="Mark all as read"
              >
                {marking ? (
                  <LoaderCircle size={14} className="spin" aria-hidden="true" />
                ) : (
                  <CheckCheck size={14} aria-hidden="true" />
                )}
                <span>Mark all read</span>
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Close notifications"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="notif__list">
            {loading ? (
              <div className="notif__status" role="status">
                <LoaderCircle size={16} className="spin" aria-hidden="true" />
                <span>Loading…</span>
              </div>
            ) : error ? (
              <div className="empty-state" role="alert" style={{ padding: 'var(--space-6)' }}>
                <p className="empty-state__label">Could not load notifications</p>
                <p className="empty-state__hint">{error}</p>
                <div className="empty-state__action">
                  <button type="button" className="button button--secondary button--sm" onClick={() => void load()}>
                    Retry
                  </button>
                </div>
              </div>
            ) : (items ?? []).length === 0 ? (
              <div className="empty-state" role="status" style={{ padding: 'var(--space-6)' }}>
                <p className="empty-state__label">All caught up</p>
                <p className="empty-state__hint">You have no notifications right now.</p>
              </div>
            ) : (
              (items ?? []).map((n) => {
                const body = (
                  <>
                    <span className={`notif__item-dot ${n.readAt ? 'is-read' : ''}`} aria-hidden="true" />
                    <span className="notif__item-body">
                      <span className="notif__item-title">{n.title}</span>
                      <span className="notif__item-detail">{n.body}</span>
                      <span className="notif__item-time">{fmtRelative(n.createdAt)}</span>
                    </span>
                  </>
                );
                return n.href ? (
                  <Link
                    key={n.id}
                    href={n.href}
                    className={`notif__item ${n.readAt ? '' : 'is-unread'}`.trim()}
                    onClick={() => {
                      setOpen(false);
                      if (!n.readAt) void markOneRead(n.id);
                    }}
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif__item notif__item--button ${n.readAt ? '' : 'is-unread'}`.trim()}
                    onClick={() => {
                      if (!n.readAt) void markOneRead(n.id);
                    }}
                  >
                    {body}
                  </button>
                );
              })
            )}
          </div>

          <footer className="notif__foot">
            <Link href="/notifications" className="notif__foot-link" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
