'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { GREEN } from '@/lib/auth-theme';

const markerIcon = divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:9999px;background:${GREEN};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export function ProjectCardMapInner({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={13}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      className="h-full w-full"
    >
      {/* OpenStreetMap's tile policy asks for its credit on every map. */}
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[latitude, longitude]} icon={markerIcon} />
    </MapContainer>
  );
}
