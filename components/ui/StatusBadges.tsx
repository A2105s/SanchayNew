import type {
  AvailabilityState,
  AvailabilityView,
  EligibilityState,
  OperationalStatus,
  OwnershipCategory
} from '@/types';
import { Badge } from '@/components/ui/Badge';
import {
  AVAILABILITY_LABEL,
  availabilityTone,
  ELIGIBILITY_LABEL,
  eligibilityTone,
  OPERATIONAL_LABEL,
  operationalTone,
  OWNERSHIP_LABEL,
  ownershipTone
} from '@/lib/fleet/format';

/**
 * Status badges kept STRICTLY SEPARATE (spec 13): operational status / ownership /
 * eligibility / availability are never merged into one overloaded string.
 */

export function OperationalBadge({ status }: { status: OperationalStatus }) {
  return <Badge tone={operationalTone(status)}>{OPERATIONAL_LABEL[status]}</Badge>;
}

export function OwnershipBadge({ category }: { category: OwnershipCategory }) {
  const title =
    category === 'GOVERNMENT_FLEET'
      ? 'Owned/controlled by an authorized government organization.'
      : category === 'SEIZED_IMPOUNDED'
        ? 'Held in custody. Not bookable through ordinary fleet allocation.'
        : 'Ownership/custody not yet verified. Ineligible until reviewed.';
  return (
    <Badge tone={ownershipTone(category)} title={title}>
      {OWNERSHIP_LABEL[category]}
    </Badge>
  );
}

export function EligibilityBadge({ state, title }: { state: EligibilityState; title?: string }) {
  return (
    <Badge tone={eligibilityTone(state)} title={title}>
      {ELIGIBILITY_LABEL[state]}
    </Badge>
  );
}

export function AvailabilityBadge({
  availability,
  state
}: {
  availability?: AvailabilityView;
  state?: AvailabilityState;
}) {
  const s = state ?? availability?.state ?? 'UNAVAILABLE';
  const reasons = availability?.reasons ?? [];
  return (
    <Badge tone={availabilityTone(s)} title={reasons.length ? reasons.join(' · ') : undefined}>
      {AVAILABILITY_LABEL[s]}
    </Badge>
  );
}
