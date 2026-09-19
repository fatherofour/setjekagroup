'use client';

import { useEffect, useState } from 'react';
import { CloudSun, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, type LucideIcon } from 'lucide-react';
import { Select } from '@/components/ui/Select';

interface CurrentWeather {
  temperature: number;
  windspeed: number;
  weathercode: number;
}

interface WeatherResponse {
  current_weather: CurrentWeather;
}

const WEATHER_CODES: Record<number, { label: string; icon: LucideIcon }> = {
  0: { label: 'Clear sky', icon: Sun },
  1: { label: 'Mainly clear', icon: Sun },
  2: { label: 'Partly cloudy', icon: CloudSun },
  3: { label: 'Overcast', icon: Cloud },
  45: { label: 'Fog', icon: CloudFog },
  48: { label: 'Fog', icon: CloudFog },
  51: { label: 'Light drizzle', icon: CloudRain },
  53: { label: 'Drizzle', icon: CloudRain },
  55: { label: 'Dense drizzle', icon: CloudRain },
  61: { label: 'Light rain', icon: CloudRain },
  63: { label: 'Rain', icon: CloudRain },
  65: { label: 'Heavy rain', icon: CloudRain },
  71: { label: 'Light snow', icon: CloudSnow },
  73: { label: 'Snow', icon: CloudSnow },
  75: { label: 'Heavy snow', icon: CloudSnow },
  80: { label: 'Rain showers', icon: CloudRain },
  81: { label: 'Rain showers', icon: CloudRain },
  82: { label: 'Violent showers', icon: CloudRain },
  95: { label: 'Thunderstorm', icon: CloudLightning },
  96: { label: 'Thunderstorm w/ hail', icon: CloudLightning },
  99: { label: 'Thunderstorm w/ hail', icon: CloudLightning },
};

function describeWeather(code: number) {
  return WEATHER_CODES[code] ?? { label: 'Unknown', icon: Cloud };
}

export interface WeatherSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface Props {
  sites: WeatherSite[];
}

export function WeatherWidget({ sites }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(sites[0]?.id ?? null);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Keep the selection valid as the project list changes (e.g. the
  // previously-selected site's coordinates were cleared).
  useEffect(() => {
    if (sites.length === 0) {
      setSelectedId(null);
    } else if (!sites.some((s) => s.id === selectedId)) {
      setSelectedId(sites[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites]);

  const site = sites.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!site) return;
    setLoading(true);
    setError(false);
    const controller = new AbortController();
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${site.latitude}&longitude=${site.longitude}&current_weather=true`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('weather request failed');
        return res.json() as Promise<WeatherResponse>;
      })
      .then((data) => setWeather(data.current_weather))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [site]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CloudSun size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Site weather</h2>
        </div>
        {sites.length > 1 && (
          <Select
            value={selectedId ?? ''}
            onChange={setSelectedId}
            options={sites.map((s) => ({ value: s.id, label: s.name }))}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />
        )}
      </div>

      {!site ? (
        <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg bg-slate-50 text-center dark:bg-slate-800/50">
          <p className="text-sm text-slate-500 dark:text-slate-400">No project location set.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Add coordinates to a project to see live weather.</p>
        </div>
      ) : loading ? (
        <p className="text-sm text-slate-400">Loading weather…</p>
      ) : error || !weather ? (
        <p className="text-sm text-slate-400">Weather unavailable right now.</p>
      ) : (
        (() => {
          const { label, icon: Icon } = describeWeather(weather.weathercode);
          return (
            <div className="flex items-center gap-4">
              <Icon size={40} className="text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{Math.round(weather.temperature)}°C</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{site.name} · wind {Math.round(weather.windspeed)} km/h</p>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
