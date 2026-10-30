'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Clock3, AlertCircle } from 'lucide-react';
import { useApiResource } from '@/hooks/useApiResource';
import {
  toIstWallClock,
  dayKeyFor,
  operatingWindowFor,
  slotStateFor,
  type SlotState,
  type SlotOverlap
} from '@/lib/fleet/spaces';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { SpaceView, SpaceBookingView } from '@/types';

interface CalendarResponse {
  bookings: SpaceBookingView[];
  blocked: boolean;
}

interface SlotItem {
  startIst: string; // HH:mm
  endIst: string;   // HH:mm
  startUtc: Date;
  endUtc: Date;
  state: SlotState;
}

interface DayColumn {
  date: Date;
  dayKey: string;
  dayLabel: string;
  dateLabel: string;
  dateStr: string; // YYYY-MM-DD (IST)
  isOpen: boolean;
  windowLabel: string;
  slots: SlotItem[];
}

export function SpaceBookingCalendar({
  space,
  onSelectSlot,
  canBook
}: {
  space: SpaceView;
  onSelectSlot?: (dateStr: string, startIst: string, endIst: string) => void;
  canBook?: boolean;
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  // Calculate start and end of selected week in IST
  const { weekStartUtc, weekEndUtc, weekLabel, days } = useMemo(() => {
    // Current time in IST
    const now = new Date();
    const istNow = toIstWallClock(now);

    // Find Sunday of the current week in IST
    const istDayOfWeek = istNow.getUTCDay(); // 0 is Sun
    const startOfCurrentWeekIstMs = Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate() - istDayOfWeek + weekOffset * 7,
      0, 0, 0, 0
    );

    // startOfCurrentWeekIstMs is wall clock time; convert back to UTC by subtracting 330 min
    const startUtc = new Date(startOfCurrentWeekIstMs - 330 * 60_000);
    const endUtc = new Date(startUtc.getTime() + 7 * 86_400_000 - 1_000);

    const istStart = toIstWallClock(startUtc);
    const istEnd = toIstWallClock(endUtc);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const label = `${istStart.getUTCDate()} ${monthNames[istStart.getUTCMonth()]} – ${istEnd.getUTCDate()} ${monthNames[istEnd.getUTCMonth()]} ${istEnd.getUTCFullYear()}`;

    // Build the 7 days array
    const dayList = [];
    for (let i = 0; i < 7; i++) {
      const dayStartUtc = new Date(startUtc.getTime() + i * 86_400_000);
      dayList.push(dayStartUtc);
    }

    return {
      weekStartUtc: startUtc,
      weekEndUtc: endUtc,
      weekLabel: label,
      days: dayList
    };
  }, [weekOffset]);

  const url = `/api/cloud/spaces/${space.id}/calendar?from=${encodeURIComponent(weekStartUtc.toISOString())}&to=${encodeURIComponent(weekEndUtc.toISOString())}`;
  const { data, loading } = useApiResource<CalendarResponse>(url);

  const bookings: SlotOverlap[] = useMemo(() => {
    return (data?.bookings ?? []).map((b) => ({
      status: b.status as 'PENDING' | 'CONFIRMED',
      startAt: new Date(b.startAt),
      endAt: new Date(b.endAt)
    }));
  }, [data]);

  const isBlockedByMaintenance = Boolean(data?.blocked || space.blockedByMaintenance);

  // Compute days and slots
  const dayColumns: DayColumn[] = useMemo(() => {
    const slotDurationHours = Math.max(1, Math.min(space.minBookingHours || 2, 4));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return days.map((dayUtc) => {
      const istDate = toIstWallClock(dayUtc);
      const dayKey = dayKeyFor(dayUtc);
      const dayLabel = dayNames[istDate.getUTCDay()];
      const dateLabel = `${istDate.getUTCDate()} ${monthNames[istDate.getUTCMonth()]}`;
      const dateStr = istDate.toISOString().slice(0, 10);

      const win = operatingWindowFor(space, dayKey);
      if (!win) {
        return {
          date: dayUtc,
          dayKey,
          dayLabel,
          dateLabel,
          dateStr,
          isOpen: false,
          windowLabel: 'Closed',
          slots: []
        };
      }

      const openH = Math.floor(win.openMin / 60);
      const openM = win.openMin % 60;
      const closeH = Math.floor(win.closeMin / 60);
      const closeM = win.closeMin % 60;
      const fmtTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const windowLabel = `${fmtTime(openH, openM)} – ${fmtTime(closeH, closeM)}`;

      const slots: SlotItem[] = [];
      let curMin = win.openMin;
      const stepMin = slotDurationHours * 60;

      while (curMin + stepMin <= win.closeMin) {
        const nextMin = curMin + stepMin;
        const sH = Math.floor(curMin / 60);
        const sM = curMin % 60;
        const eH = Math.floor(nextMin / 60);
        const eM = nextMin % 60;

        const startIstStr = fmtTime(sH, sM);
        const endIstStr = fmtTime(eH, eM);

        // Convert slot instants to UTC
        const slotStartUtc = new Date(new Date(`${dateStr}T${startIstStr}:00+05:30`).getTime());
        const slotEndUtc = new Date(new Date(`${dateStr}T${endIstStr}:00+05:30`).getTime());
        const midInstant = new Date((slotStartUtc.getTime() + slotEndUtc.getTime()) / 2);

        const state = slotStateFor(space, bookings, isBlockedByMaintenance, midInstant);

        slots.push({
          startIst: startIstStr,
          endIst: endIstStr,
          startUtc: slotStartUtc,
          endUtc: slotEndUtc,
          state
        });

        curMin = nextMin;
      }

      return {
        date: dayUtc,
        dayKey,
        dayLabel,
        dateLabel,
        dateStr,
        isOpen: true,
        windowLabel,
        slots
      };
    });
  }, [days, space, bookings, isBlockedByMaintenance]);

  return (
    <Panel
      title="Availability Calendar (Spec 09)"
      action={
        <div className="cluster" style={{ gap: 6 }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<ChevronLeft size={14} />}
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
          />
          <Button
            variant={weekOffset === 0 ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setWeekOffset(0)}
          >
            This week
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<ChevronRight size={14} />}
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Next week"
          />
        </div>
      }
    >
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarDays size={16} className="text-muted" aria-hidden="true" />
          <strong>{weekLabel}</strong>
          {loading ? <span className="text-muted" style={{ fontSize: '0.8rem' }}>Updating slots...</span> : null}
        </div>
        <div className="cluster" style={{ fontSize: '0.78rem', gap: 8 }}>
          <span><Badge tone="success">Available</Badge> Open for reservation</span>
          <span><Badge tone="warning">Pending</Badge> Awaiting approval</span>
          <span><Badge tone="neutral">Booked</Badge> Reserved</span>
          <span><Badge tone="danger">Maintenance</Badge> Blocked</span>
        </div>
      </div>

      {isBlockedByMaintenance ? (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: 14,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-secondary)',
            borderLeft: '4px solid var(--color-danger)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '0.85rem'
          }}
        >
          <AlertCircle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
          <span>
            <strong>Facility blocked by maintenance:</strong> All slots are locked against reservations until the active maintenance tickets are resolved.
          </span>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10,
          overflowX: 'auto'
        }}
      >
        {dayColumns.map((col) => (
          <div
            key={col.dateStr}
            style={{
              padding: '10px 8px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minWidth: 120
            }}
          >
            <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{col.dayLabel.slice(0, 3)}</div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>{col.dateLabel}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: 2 }}>{col.windowLabel}</div>
            </div>

            {!col.isOpen ? (
              <div className="text-muted" style={{ fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                Closed
              </div>
            ) : col.slots.length === 0 ? (
              <div className="text-muted" style={{ fontSize: '0.75rem', textAlign: 'center', padding: '12px 0' }}>
                No standard slots
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {col.slots.map((s, idx) => {
                  const isSelectable = s.state === 'available' && canBook && !isBlockedByMaintenance;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!isSelectable}
                      onClick={() => {
                        if (isSelectable && onSelectSlot) {
                          onSelectSlot(col.dateStr, s.startIst, s.endIst);
                        }
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-primary)',
                        cursor: isSelectable ? 'pointer' : 'default',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        transition: 'border-color 0.15s ease'
                      }}
                    >
                      <div className="mono" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock3 size={11} className="text-muted" />
                        {s.startIst}–{s.endIst}
                      </div>
                      <div>
                        {s.state === 'available' ? (
                          <Badge tone="success">Available</Badge>
                        ) : s.state === 'pending approval' ? (
                          <Badge tone="warning">Pending</Badge>
                        ) : s.state === 'booked' ? (
                          <Badge tone="neutral">Booked</Badge>
                        ) : s.state === 'maintenance' ? (
                          <Badge tone="danger">Maintenance</Badge>
                        ) : (
                          <Badge tone="neutral">Closed</Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
