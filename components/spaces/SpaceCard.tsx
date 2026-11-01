'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, MapPin, Wrench, Clock3, Building2, Image as ImageIcon, Sparkles, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { SPACE_STATE_LABEL } from '@/lib/fleet/spaces';
import { getSpaceHeroPhoto, getSpacePhotos, DEFAULT_FALLBACK_PHOTO } from '@/lib/fleet/space-photos';
import type { SpaceView } from '@/types';

export function SpaceStateBadge({ space }: { space: SpaceView }) {
  if (space.blockedByMaintenance) {
    return (
      <Badge tone="danger">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Wrench size={11} aria-hidden="true" /> Maintenance
        </span>
      </Badge>
    );
  }
  if (space.busyNow) {
    return (
      <Badge tone="warning">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Clock3 size={11} aria-hidden="true" /> Booked now
        </span>
      </Badge>
    );
  }
  const tone =
    space.operationalState === 'AVAILABLE'
      ? 'success'
      : space.operationalState === 'RESTRICTED'
        ? 'danger'
        : space.operationalState === 'RETIRED'
          ? 'neutral'
          : 'warning';
  return <Badge tone={tone}>{SPACE_STATE_LABEL[space.operationalState]}</Badge>;
}

export function SpaceCategoryLabel({ category }: { category: string }) {
  return category.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SpaceCard({ space, canBook }: { space: SpaceView; canBook: boolean }) {
  const heroPhoto = getSpaceHeroPhoto(space);
  const [photoSrc, setPhotoSrc] = useState(heroPhoto);
  const [imgError, setImgError] = useState(false);
  const photos = getSpacePhotos(space);
  const photoCount = photos.length;

  useEffect(() => {
    setPhotoSrc(heroPhoto);
    setImgError(false);
  }, [heroPhoto]);

  const handleImageError = () => {
    if (photoSrc !== DEFAULT_FALLBACK_PHOTO) {
      setPhotoSrc(DEFAULT_FALLBACK_PHOTO);
    } else {
      setImgError(true);
    }
  };

  const bookable =
    canBook &&
    !space.blockedByMaintenance &&
    space.operationalState !== 'RESTRICTED' &&
    space.operationalState !== 'RETIRED';

  const previewAmenities = (space.amenities || []).slice(0, 3);

  return (
    <article
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-lg, 12px)',
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        background: 'var(--color-surface)'
      }}
    >
      {/* Photo Header (Airbnb-Grade Cover) */}
      <Link
        href={`/spaces/${space.id}`}
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          aspectRatio: '16 / 10',
          overflow: 'hidden',
          background: 'var(--color-surface-hover, #f1f5f9)',
          textDecoration: 'none'
        }}
      >
        {!imgError ? (
          <img
            src={photoSrc}
            alt={space.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={handleImageError}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s ease'
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--color-text-muted)'
            }}
          >
            <ImageIcon size={32} />
            <span style={{ fontSize: '0.75rem', marginTop: 4 }}>Civic Property</span>
          </div>
        )}

        {/* Category Pill Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill, 9999px)',
            background: 'rgba(15, 23, 42, 0.78)',
            color: '#ffffff',
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            backdropFilter: 'blur(6px)'
          }}
        >
          {SpaceCategoryLabel({ category: space.category })}
        </div>

        {/* State Badge Overlay */}
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <SpaceStateBadge space={space} />
        </div>

        {/* Photo Count Badge */}
        {photoCount > 0 ? (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 10,
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm, 6px)',
              background: 'rgba(0, 0, 0, 0.65)',
              color: '#ffffff',
              fontSize: '0.7rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <ImageIcon size={11} /> {photoCount} photos
          </div>
        ) : null}
      </Link>

      {/* Body Content */}
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
        <div>
          <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
            <Link
              href={`/spaces/${space.id}`}
              style={{
                fontWeight: 700,
                fontSize: '1.02rem',
                color: 'var(--color-text-primary)',
                lineHeight: 1.3
              }}
            >
              {space.name}
            </Link>
          </div>
          <div className="cluster" style={{ gap: 8, marginTop: 3 }}>
            <span className="mono text-muted" style={{ fontSize: '0.74rem' }}>{space.assetCode}</span>
            {space.organizationName ? (
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--color-brand)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <Building2 size={11} /> {space.organizationName}
              </span>
            ) : null}
          </div>
        </div>

        {/* Property Specs */}
        <div className="text-muted" style={{ fontSize: '0.82rem', display: 'grid', gap: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Users size={13} aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />
            <span>Capacity <strong>{space.capacity}</strong> attendees</span>
            {space.areaSqft ? <span>· {space.areaSqft.toLocaleString()} sq.ft</span> : null}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={13} aria-hidden="true" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[space.buildingOrCampus, space.district, space.city].filter(Boolean).join(', ') || 'Location not recorded'}
            </span>
          </span>
        </div>

        {/* Amenities Highlights */}
        {previewAmenities.length > 0 ? (
          <div className="cluster" style={{ gap: 4, flexWrap: 'wrap', margin: '4px 0' }}>
            {previewAmenities.map((amenity, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--color-surface-hover, #f1f5f9)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)'
                }}
              >
                {amenity}
              </span>
            ))}
            {(space.amenities?.length || 0) > 3 ? (
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                +{space.amenities!.length - 3} more
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="cluster" style={{ marginTop: 'auto', paddingTop: '0.5rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <ButtonLink href={`/spaces/${space.id}`} variant="secondary" size="sm">
            Inspect Specs
          </ButtonLink>
          {bookable ? (
            <ButtonLink href={`/spaces/${space.id}`} variant="primary" size="sm">
              Book Property
            </ButtonLink>
          ) : (
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              {space.blockedByMaintenance
                ? 'Under maintenance'
                : space.operationalState === 'RESTRICTED'
                  ? 'Restricted'
                  : space.operationalState === 'RETIRED'
                    ? 'Retired'
                    : 'Requires booking role'}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
