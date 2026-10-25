'use client';

import { Building2, CalendarCheck, Cpu, Leaf, ArrowLeft, Check, Circle } from 'lucide-react';
import { PageTitle } from '@/components/ui/PageTitle';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/Button';

const CAPABILITIES = [
  { icon: Building2, title: 'Civic space registry', desc: 'Parks, halls, grounds, and shared assets catalogued with ownership and zones.' },
  { icon: CalendarCheck, title: 'Booking & allocation', desc: 'Citizens and departments reserve spaces with approval workflows, mirroring fleet requisitions.' },
  { icon: Leaf, title: 'Idle activation', desc: 'Surface under-used civic spaces and route them to events, markets, or community programs.' },
  { icon: Cpu, title: 'IoT occupancy & air quality', desc: 'Placeholder sensors for footfall, occupancy, and air-quality monitoring per space.' },
];

const ROADMAP = [
  { done: false, label: 'Space registry schema and CRUD' },
  { done: false, label: 'Zone-based search and map view' },
  { done: false, label: 'Booking workflow with approvals' },
  { done: false, label: 'Idle-space reuse suggestions' },
  { done: false, label: 'IoT sensor placeholders (occupancy, AQI)' },
];

export default function SpacesPage() {
  return (
    <div className="page stack">
      <PageTitle
        eyebrow="Module preview"
        title="Civic Spaces"
        description="The next module after Fleet. Planning view only."
        action={<Badge tone="info">Coming soon</Badge>}
      />

      <div className="ops-hero">
        <h2>Bring the same discipline to civic spaces</h2>
        <p className="text-muted" style={{ maxWidth: 640, margin: 0 }}>
          Sanchay Spaces will extend the fleet operating model to physical civic assets - parks, community
          halls, grounds and shared facilities - with a registry, bookings, idle activation, and IoT sensing.
        </p>
        <div className="cluster">
          <Button variant="primary" disabled title="Not available yet">
            Notify me when ready
          </Button>
          <ButtonLink href="/dashboard" variant="secondary" icon={<ArrowLeft size={15} />}>
            Back to Fleet
          </ButtonLink>
        </div>
      </div>

      <div className="grid-2">
        <Panel title="Planned capabilities">
          <div className="stack">
            {CAPABILITIES.map((c) => {
              const Icon = c.icon;
              return (
                <div className="ops-gateway" key={c.title}>
                  <span className="ops-gateway-icon">
                    <Icon size={20} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 560 }}>{c.title}</div>
                    <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                      {c.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Roadmap">
          <div className="ops-roadmap">
            {ROADMAP.map((r) => (
              <div className="ops-roadmap-item" key={r.label}>
                {r.done ? (
                  <Check size={16} color="#16a34a" />
                ) : (
                  <Circle size={16} color="#94a3b8" />
                )}
                <span className={r.done ? '' : 'text-muted'}>{r.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
