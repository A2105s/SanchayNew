'use client';

import Link from 'next/link';
import { Users, MapPin, Wrench, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { SPACE_STATE_LABEL } from '@/lib/fleet/spaces';
import type { SpaceView } from '@/types';

export function SpaceStateBadge({ space }: { space: SpaceView }) {
  if (space.blockedByMaintenance) {
    return (
      <span className="cluster" style={{ gap: 6, flexWrap: 'wrap' }}>
        <Badge tone="danger">Maintenance</Badge>
        <Wrench size={12} aria-hidden="true" />
      </span>
    );
  }
  if (space.busyNow) return <Badge tone="info">Booked now</Badge>;
  const tone = space.operationalState === 'AVAILABLE' ? 'success' : space.operationalState === 'RESTRICTED' ? 'danger' : space.operationalState === 'RETIRED' ? 'neutral' : 'warning';
  return <Badge tone={tone}>{SPACE_STATE_LABEL[space.operationalState]}</Badge>;
}

export function SpaceCategoryLabel({ category }: { category: string }) {
  return category.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SpaceCard({ space, canBook }: { space: SpaceView; canBook: boolean }) {
  const bookable = canBook && !space.blockedByMaintenance && space.operationalState !== 'RESTRICTED' && space.operationalState !== 'RETIRED';
  return (
    <article className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1rem' }}>
      <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <Link href={`/spaces/${space.id}`} style={{ fontWeight: 600 }}>{space.name}</Link>
          <div className="text-muted mono" style={{ fontSize: '0.75rem' }}>{space.assetCode}</div>
        </div>
        <SpaceStateBadge space={space} />
      </div>
      <div className="text-muted" style={{ fontSize: '0.85rem', display: 'grid', gap: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Users size={13} aria-hidden="true" /> Capacity {space.capacity} · {SpaceCategoryLabel({ category: space.category })}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={13} aria-hidden="true" />
          {[space.buildingOrCampus, space.district, space.city].filter(Boolean).join(', ') || 'Location not recorded'}
        </span>
        {space.idleDays != null && space.idleDays >= 7 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Clock3 size={13} aria-hidden="true" /> Idle {space.idleDays} d
          </span>
        ) : null}
      </div>
      <div className="cluster" style={{ marginTop: 'auto', flexWrap: 'wrap' }}>
        <ButtonLink href={`/spaces/${space.id}`} variant="secondary" size="sm">View details</ButtonLink>
        {bookable ? (
          <ButtonLink href={`/spaces/${space.id}`} variant="primary" size="sm">Book now</ButtonLink>
        ) : (
          <span className="text-muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>
            {space.blockedByMaintenance ? 'Under maintenance' : space.operationalState === 'RESTRICTED' ? 'Restricted — not bookable' : space.operationalState === 'RETIRED' ? 'Retired' : 'Sign in with booking rights'}
          </span>
        )}
      </div>
    </article>
  );
}
