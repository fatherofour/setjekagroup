'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { GREEN } from '@/lib/auth-theme';

export interface MappableProject {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

const markerIcon = divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:${GREEN};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export function ProjectsMapInner({ projects }: { projects: MappableProject[] }) {
  const center: [number, number] =
    projects.length > 0
      ? [projects.reduce((sum, p) => sum + p.latitude, 0) / projects.length, projects.reduce((sum, p) => sum + p.longitude, 0) / projects.length]
      : [0, 20];

  return (
    <MapContainer center={center} zoom={projects.length > 0 ? 4 : 2} scrollWheelZoom={false} className="h-full w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {projects.map((p) => (
        <Marker key={p.id} position={[p.latitude, p.longitude]} icon={markerIcon}>
          <Popup>{p.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
