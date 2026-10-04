import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Download, ExternalLink, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

export interface MediaItem {
  url: string;
  title?: string;
  caption?: string;
  mimeType?: string;
  qualityScore?: number;
}

interface MediaPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaList: MediaItem[];
  initialIndex?: number;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  isOpen,
  onClose,
  mediaList,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoom(1);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, mediaList.length]);

  if (!isOpen || !mediaList || mediaList.length === 0) return null;

  const currentMedia = mediaList[currentIndex] || mediaList[0];
  const isVideo =
    currentMedia.mimeType?.startsWith('video') ||
    currentMedia.url?.endsWith('.mp4') ||
    currentMedia.url?.includes('video') ||
    currentMedia.title?.toLowerCase().includes('video');

  const handleNext = () => {
    if (currentIndex < mediaList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setZoom(1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setZoom(1);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.92)',
        backdropFilter: 'blur(16px)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      {/* Top Controls Bar */}
      <div
        style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
          zIndex: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {isVideo ? '🎥 Stream Video' : '📷 High-Res Evidence'}
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              {currentMedia.title || `Media Asset #${currentIndex + 1}`}
            </h3>
            {currentMedia.caption && (
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                {currentMedia.caption}
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Zoom In/Out for images */}
          {!isVideo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(30, 41, 59, 0.8)', padding: '4px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}
                title="Zoom Out"
              >
                <ZoomOut size={16} />
              </button>
              <span style={{ fontSize: '11px', color: '#38bdf8', minWidth: '36px', textAlign: 'center', fontWeight: 600 }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}
                title="Zoom In"
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', fontSize: '10px', marginLeft: '4px' }}
                title="Reset Zoom"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          )}

          {/* Open in new tab */}
          <a
            href={currentMedia.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
            title="Open raw full URL in new tab"
          >
            <ExternalLink size={14} /> Open Raw
          </a>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Close preview (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Media Stage */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: '20px',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Previous Button */}
        {mediaList.length > 1 && (
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            style={{
              position: 'absolute',
              left: '24px',
              zIndex: 20,
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: currentIndex === 0 ? '#475569' : '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              transition: 'all 0.2s ease',
            }}
            title="Previous Asset (Left Arrow)"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Media Content */}
        <div
          style={{
            maxWidth: '90vw',
            maxHeight: '75vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s ease-out',
            transform: `scale(${zoom})`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo ? (
            <video
              src={currentMedia.url}
              controls
              autoPlay
              playsInline
              style={{
                maxWidth: '85vw',
                maxHeight: '75vh',
                borderRadius: '12px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.2)',
                background: '#000000',
              }}
            />
          ) : (
            <img
              src={currentMedia.url}
              alt={currentMedia.title || 'Observation evidence'}
              style={{
                maxWidth: '85vw',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.2)',
                userSelect: 'none',
              }}
            />
          )}
        </div>

        {/* Next Button */}
        {mediaList.length > 1 && (
          <button
            type="button"
            disabled={currentIndex === mediaList.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            style={{
              position: 'absolute',
              right: '24px',
              zIndex: 20,
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: currentIndex === mediaList.length - 1 ? '#475569' : '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: currentIndex === mediaList.length - 1 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              transition: 'all 0.2s ease',
            }}
            title="Next Asset (Right Arrow)"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip / Gallery Navigation */}
      {mediaList.length > 1 && (
        <div
          style={{
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
            zIndex: 10,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {mediaList.map((item, idx) => {
            const isItemVideo =
              item.mimeType?.startsWith('video') ||
              item.url?.endsWith('.mp4') ||
              item.title?.toLowerCase().includes('video');
            const isSelected = idx === currentIndex;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setCurrentIndex(idx);
                  setZoom(1);
                }}
                style={{
                  width: '64px',
                  height: '48px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.2)',
                  background: '#0f172a',
                  padding: 0,
                  cursor: 'pointer',
                  position: 'relative',
                  opacity: isSelected ? 1 : 0.6,
                  transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                }}
              >
                {isItemVideo ? (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#1e293b',
                      color: '#38bdf8',
                      fontSize: '10px',
                    }}
                  >
                    ▶ Video
                  </div>
                ) : (
                  <img
                    src={item.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
