import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Site, SubSite } from '../types';
import { MapPin, Compass, Layers } from 'lucide-react';

interface StreamMapProps {
  sites: Site[];
  selectedSite: Site;
  selectedSubSite: SubSite;
  onSelectSite?: (site: Site, subSite: SubSite) => void;
  height?: string;
}

export const StreamMap: React.FC<StreamMapProps> = ({
  sites,
  selectedSite,
  selectedSubSite,
  onSelectSite,
  height = '340px'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [mapMode, setMapMode] = useState<'streets' | 'satellite'>('streets');

  // Tile layer URLs - 100% public, free, NO API key required
  const TILE_PROVIDERS = {
    streets: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
      maxZoom: 18
    }
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = selectedSubSite.coordinates.lat;
      const initialLng = selectedSubSite.coordinates.lng;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
        zoomControl: false,
        attributionControl: true
      });

      // Default: OpenStreetMap standard tiles (Zero API key required)
      const baseTile = L.tileLayer(TILE_PROVIDERS.streets.url, {
        attribution: TILE_PROVIDERS.streets.attribution,
        maxZoom: TILE_PROVIDERS.streets.maxZoom
      }).addTo(map);

      tileLayerRef.current = baseTile;

      // Add custom zoom control at bottom-right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      // Invalidate size to ensure crisp rendering
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update tile layer when mapMode toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const provider = TILE_PROVIDERS[mapMode];
    const newTile = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom
    }).addTo(map);

    tileLayerRef.current = newTile;
    newTile.bringToBack();
  }, [mapMode]);

  // Update markers and pan when selectedSite or selectedSubSite changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    // Add markers for all sub-sites in current selected site
    selectedSite.subSites.forEach((subSite) => {
      const isSelected = subSite.code === selectedSubSite.code;
      const riskColor =
        subSite.healthRisk === 'Low'
          ? '#10b981'
          : subSite.healthRisk === 'Moderate'
          ? '#f59e0b'
          : '#ef4444';

      const iconHtml = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: ${isSelected ? '38px' : '28px'};
          height: ${isSelected ? '38px' : '28px'};
          border-radius: 50%;
          background: ${isSelected ? '#0284c7' : '#0f172a'};
          border: 2px solid ${isSelected ? '#38bdf8' : riskColor};
          box-shadow: ${isSelected ? '0 0 15px #38bdf8, 0 4px 6px rgba(0,0,0,0.5)' : '0 2px 5px rgba(0,0,0,0.4)'};
          color: #ffffff;
          font-size: ${isSelected ? '12px' : '10px'};
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s;
        ">
          ${subSite.code}
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-stream-pin',
        iconSize: isSelected ? [38, 38] : [28, 28],
        iconAnchor: isSelected ? [19, 19] : [14, 14]
      });

      const marker = L.marker([subSite.coordinates.lat, subSite.coordinates.lng], {
        icon: customIcon,
        zIndexOffset: isSelected ? 1000 : 100
      });

      marker.bindPopup(`
        <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; line-height: 1.4;">
          <strong style="color: #0284c7; font-size: 14px;">${subSite.code} — ${subSite.name}</strong><br/>
          <span style="color: #64748b; font-size: 11px;">📍 ${selectedSite.city} (${selectedSite.country})</span><br/>
          <div style="margin-top: 6px; display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${riskColor}22; color: ${riskColor}; font-weight: 700; font-size: 11px;">
            ${subSite.healthRisk} Risk Reach
          </div>
          <div style="margin-top: 4px; font-size: 11px; color: #475569;">
            Lat: ${subSite.coordinates.lat.toFixed(4)}, Lng: ${subSite.coordinates.lng.toFixed(4)}
          </div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectSite) {
          onSelectSite(selectedSite, subSite);
        }
      });

      markersLayer.addLayer(marker);

      if (isSelected) {
        marker.openPopup();
      }
    });

    // Also add subtle markers for other OneAquaHealth monitoring catchments across Europe
    sites.forEach((site) => {
      if (site.id === selectedSite.id) return;

      const otherIconHtml = `
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #334155;
          border: 2px solid #64748b;
          cursor: pointer;
          opacity: 0.75;
        " title="${site.city} Catchment"></div>
      `;

      const otherIcon = L.divIcon({
        html: otherIconHtml,
        className: 'other-site-pin',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const otherMarker = L.marker([site.coordinates.lat, site.coordinates.lng], {
        icon: otherIcon
      });

      otherMarker.bindTooltip(`📍 ${site.city} Catchment (Click to switch)`, { direction: 'top' });

      otherMarker.on('click', () => {
        if (onSelectSite && site.subSites.length > 0) {
          onSelectSite(site, site.subSites[0]);
        }
      });

      markersLayer.addLayer(otherMarker);
    });

    // Smoothly animate map to selected subsite coordinates
    map.flyTo([selectedSubSite.coordinates.lat, selectedSubSite.coordinates.lng], 13, {
      duration: 1.0
    });
  }, [selectedSite, selectedSubSite, sites, onSelectSite]);

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(
        [selectedSubSite.coordinates.lat, selectedSubSite.coordinates.lng],
        14,
        { duration: 0.8 }
      );
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        height,
        width: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #334155',
        background: '#091122',
        boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
      }}
    >
      {/* Map Target Container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

      {/* Floating Info Overlay (Upper Right) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'rgba(15, 23, 42, 0.92)',
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid #38bdf8',
          boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
          zIndex: 1000,
          pointerEvents: 'auto',
          backdropFilter: 'blur(8px)',
          maxWidth: '240px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 700, fontSize: '13px' }}>
          <MapPin size={15} /> {selectedSite.city} ({selectedSite.country})
        </div>
        <div style={{ color: '#ffffff', fontWeight: 600, fontSize: '12px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selectedSubSite.code} — {selectedSubSite.name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11px' }}>
          <span style={{ color: '#94a3b8' }}>
            {selectedSubSite.coordinates.lat.toFixed(4)}, {selectedSubSite.coordinates.lng.toFixed(4)}
          </span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '8px',
              fontSize: '10px',
              fontWeight: 700,
              background:
                selectedSubSite.healthRisk === 'Low'
                  ? 'rgba(16, 185, 129, 0.2)'
                  : selectedSubSite.healthRisk === 'Moderate'
                  ? 'rgba(245, 158, 11, 0.2)'
                  : 'rgba(239, 68, 68, 0.2)',
              color:
                selectedSubSite.healthRisk === 'Low'
                  ? '#34d399'
                  : selectedSubSite.healthRisk === 'Moderate'
                  ? '#fbbf24'
                  : '#f87171',
              border: `1px solid ${
                selectedSubSite.healthRisk === 'Low'
                  ? '#10b981'
                  : selectedSubSite.healthRisk === 'Moderate'
                  ? '#f59e0b'
                  : '#ef4444'
              }`
            }}
          >
            {selectedSubSite.healthRisk} Risk
          </span>
        </div>
      </div>

      {/* Floating Controls (Bottom Left: Recenter & Satellite/Street Toggle) */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          zIndex: 1000,
          display: 'flex',
          gap: '8px'
        }}
      >
        <button
          onClick={handleRecenter}
          title="Center on selected sub-site"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid #38bdf8',
            color: '#38bdf8',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
          }}
        >
          <Compass size={13} /> Recenter
        </button>

        <button
          onClick={() => setMapMode(mapMode === 'streets' ? 'satellite' : 'streets')}
          title="Toggle Satellite Imagery / OpenStreetMap"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid #64748b',
            color: '#cbd5e1',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
          }}
        >
          <Layers size={13} /> {mapMode === 'streets' ? 'Satellite View' : 'Street Map'}
        </button>
      </div>
    </div>
  );
};
