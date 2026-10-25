'use client';

import Link from 'next/link';
import { Car } from 'lucide-react';
import type { VehicleCardView, VehicleView } from '@/types';
import { CLASS_LABEL } from '@/lib/fleet/format';
import { OperationalBadge, OwnershipBadge, EligibilityBadge, AvailabilityBadge } from '@/components/ui/StatusBadges';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';

/** True when the item is a full VehicleView (own-scope). */
export function isVehicleView(v: VehicleView | VehicleCardView): v is VehicleView {
  return (v as VehicleView).registrationNumber !== undefined;
}

/** Registration shown for the row/card: full for own-org, masked otherwise. */
export function registrationLabel(v: VehicleView | VehicleCardView): string {
  if (isVehicleView(v)) return v.registrationNumber;
  return (v as VehicleCardView).registrationMasked;
}

export function stationLabelOf(v: VehicleView | VehicleCardView, stationName: (id: string | null) => string): string {
  if (isVehicleView(v)) return stationName(v.stationId);
  return (v as VehicleCardView).stationName ?? '—';
}

/**
 * Card used by the registry (card view) and discovery results. For discovery /
 * foreign vehicles the item is a VehicleCardView: masked registration, no driver,
 * no odometer, no exact position.
 */
export function VehicleCard({
  vehicle,
  href,
  footer
}: {
  vehicle: VehicleView | VehicleCardView;
  href?: string;
  footer?: React.ReactNode;
}) {
  const full = isVehicleView(vehicle);
  const reg = registrationLabel(vehicle);
  const card = vehicle as VehicleCardView;

  const body = (
    <div className="veh-card">
      <div className="veh-card-head">
        <div>
          <div className="veh-card-reg mono">{reg}</div>
          <div className="veh-card-sub">{vehicle.displayName}</div>
        </div>
        <span className="veh-card-icon" aria-hidden="true">
          <Car size={18} />
        </span>
      </div>

      <div className="cluster" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
        <OperationalBadge status={vehicle.operationalStatus} />
        {full ? <OwnershipBadge category={(vehicle as VehicleView).ownershipCategory} /> : null}
        <EligibilityBadge state={vehicle.eligibilityState} />
        {!full ? <AvailabilityBadge availability={card.availability} /> : null}
      </div>

      <div className="veh-card-meta">
        <span>{CLASS_LABEL[vehicle.vehicleClass]}</span>
        <span>{vehicle.organizationName}</span>
      </div>

      <FreshnessBadge freshness={vehicle.telemetryFreshness} lastSeenAt={vehicle.lastSeenAt} />

      {footer ? <div className="veh-card-foot">{footer}</div> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="veh-card-link">
        {body}
      </Link>
    );
  }
  return body;
}
