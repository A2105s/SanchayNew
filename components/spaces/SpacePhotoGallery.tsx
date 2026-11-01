'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSpacePhotos, DEFAULT_FALLBACK_PHOTO } from '@/lib/fleet/space-photos';
import type { SpaceView } from '@/types';

export function SpacePhotoGallery({ space }: { space: SpaceView }) {
  const photos = getSpacePhotos(space);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const openAt = (idx: number) => {
    setActiveIdx(idx);
    setModalOpen(true);
  };

  const nextPhoto = useCallback(() => {
    setActiveIdx((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  }, [photos.length]);

  const prevPhoto = useCallback(() => {
    setActiveIdx((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  }, [photos.length]);

  // Lock body scroll and register keyboard navigation when modal is open
  useEffect(() => {
    if (!modalOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setModalOpen(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextPhoto();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevPhoto();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalOpen, nextPhoto, prevPhoto]);

  if (photos.length === 0) {
    return null;
  }

  const mainPhoto = photos[0];
  const sidePhotos = photos.slice(1, 3);

  return (
    <>
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-lg, 14px)',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '1rem'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: sidePhotos.length > 0 ? '1.8fr 1fr' : '1fr',
            gap: 4,
            height: 380,
            cursor: 'pointer'
          }}
        >
          {/* Hero Main Photo */}
          <div
            style={{ position: 'relative', height: '100%', overflow: 'hidden' }}
            onClick={() => openAt(0)}
          >
            <img
              src={mainPhoto}
              alt={space.name}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const el = e.currentTarget;
                if (el.src !== DEFAULT_FALLBACK_PHOTO) el.src = DEFAULT_FALLBACK_PHOTO;
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.3s ease'
              }}
            />
          </div>

          {/* Side Thumbnail Stack */}
          {sidePhotos.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateRows: sidePhotos.length === 1 ? '1fr' : '1fr 1fr',
                gap: 4,
                height: '100%'
              }}
            >
              {sidePhotos.map((photo, i) => (
                <div
                  key={i}
                  style={{ position: 'relative', height: '100%', overflow: 'hidden' }}
                  onClick={() => openAt(i + 1)}
                >
                  <img
                    src={photo}
                    alt={`${space.name} view ${i + 2}`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (el.src !== DEFAULT_FALLBACK_PHOTO) el.src = DEFAULT_FALLBACK_PHOTO;
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Floating View All Photos Button */}
        <button
          type="button"
          onClick={() => openAt(0)}
          style={{
            position: 'absolute',
            bottom: 14,
            right: 14,
            padding: '7px 16px',
            borderRadius: 'var(--radius-md, 8px)',
            background: 'rgba(15, 23, 42, 0.88)',
            color: '#ffffff',
            fontSize: '0.82rem',
            fontWeight: 600,
            border: '1px solid rgba(255, 255, 255, 0.25)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'background 0.2s ease, transform 0.15s ease'
          }}
        >
          <ImageIcon size={15} /> Show all {photos.length} photos
        </button>
      </div>

      {/* Airbnb-Grade Fullscreen Lightbox Portal */}
      {modalOpen && mounted && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Photo gallery for ${space.name}`}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999999,
                background: '#090d16',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                overscrollBehavior: 'contain'
              }}
              onClick={() => setModalOpen(false)}
            >
              {/* Header Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 28px',
                  background: 'rgba(9, 13, 22, 0.95)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(10px)',
                  color: '#ffffff',
                  zIndex: 10
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <strong style={{ fontSize: '1.05rem', letterSpacing: '-0.01em', color: '#f8fafc' }}>
                    {space.name}
                  </strong>
                  {space.assetCode ? (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#94a3b8',
                        fontWeight: 500
                      }}
                    >
                      {space.assetCode}
                    </span>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#ffffff',
                      background: 'rgba(255, 255, 255, 0.12)',
                      padding: '4px 14px',
                      borderRadius: '9999px',
                      letterSpacing: '0.04em'
                    }}
                  >
                    {activeIdx + 1} / {photos.length}
                  </span>

                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(255, 255, 255, 0.12)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 8,
                      padding: '7px 14px',
                      color: '#ffffff',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.18s ease'
                    }}
                  >
                    <X size={16} /> Close
                  </button>
                </div>
              </div>

              {/* Main Photo Centerpiece */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  width: '100%',
                  padding: '20px 80px',
                  boxSizing: 'border-box',
                  overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Previous Button */}
                {photos.length > 1 ? (
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={(e) => {
                      e.stopPropagation();
                      prevPhoto();
                    }}
                    style={{
                      position: 'absolute',
                      left: 24,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.14)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                      transition: 'all 0.18s ease',
                      zIndex: 5
                    }}
                  >
                    <ChevronLeft size={26} />
                  </button>
                ) : null}

                {/* The Active Photograph */}
                <img
                  key={activeIdx}
                  src={photos[activeIdx]}
                  alt={`${space.name} photograph ${activeIdx + 1}`}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (el.src !== DEFAULT_FALLBACK_PHOTO) el.src = DEFAULT_FALLBACK_PHOTO;
                  }}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 'calc(100vh - 220px)',
                    objectFit: 'contain',
                    borderRadius: 10,
                    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
                    userSelect: 'none'
                  }}
                />

                {/* Next Button */}
                {photos.length > 1 ? (
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={(e) => {
                      e.stopPropagation();
                      nextPhoto();
                    }}
                    style={{
                      position: 'absolute',
                      right: 24,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.14)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                      transition: 'all 0.18s ease',
                      zIndex: 5
                    }}
                  >
                    <ChevronRight size={26} />
                  </button>
                ) : null}
              </div>

              {/* Bottom Thumbnail Tray */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '14px 24px',
                  background: 'rgba(9, 13, 22, 0.95)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(10px)',
                  zIndex: 10
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    maxWidth: '85vw',
                    overflowX: 'auto',
                    padding: '4px'
                  }}
                >
                  {photos.map((p, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setActiveIdx(i)}
                      style={{
                        padding: 0,
                        border: activeIdx === i ? '2px solid #38bdf8' : '2px solid transparent',
                        borderRadius: 8,
                        background: 'transparent',
                        cursor: 'pointer',
                        opacity: activeIdx === i ? 1 : 0.5,
                        transform: activeIdx === i ? 'scale(1.06)' : 'scale(1)',
                        transition: 'all 0.18s ease',
                        flexShrink: 0
                      }}
                    >
                      <img
                        src={p}
                        alt={`Thumbnail ${i + 1}`}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (el.src !== DEFAULT_FALLBACK_PHOTO) el.src = DEFAULT_FALLBACK_PHOTO;
                        }}
                        style={{
                          width: 72,
                          height: 48,
                          objectFit: 'cover',
                          borderRadius: 6,
                          display: 'block'
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
