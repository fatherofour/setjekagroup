'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudSun, Droplets, Wind } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { describeWeather } from '@/components/dashboard/WeatherWidget';
import { formatDate } from '@/lib/dates';

interface WeatherDay {
  id: string;
  date: string;
  weatherCode: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  windMaxKmh: number | null;
  isComplete: boolean;
}

interface History {
  recording: boolean;
  hasLocation: boolean;
  days: WeatherDay[];
}

const inputClass =
  'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const dayLabel = (iso: string) => formatDate(`${iso.slice(0, 10)}T12:00:00`);
const round = (n: number | null) => (n == null ? '—' : Math.round(n).toString());

/** The site's weather, recorded daily for the life of the project (App
 * Review, 17 Oct 2026), so past conditions can be looked up, e.g. when a
 * delay is claimed for rain. */
export function SiteWeatherHistory({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    authedFetch<History>(`/projects/${projectId}/weather?${params}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the weather record'));
  }, [authedFetch, projectId, from, to]);

  useEffect(load, [load]);

  const days = data?.days ?? [];
  const rainDays = days.filter((d) => (d.precipitationMm ?? 0) >= 1).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-labelledby="site-weather-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="site-weather-title" className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <CloudSun size={15} /> Site weather record
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {!data
              ? 'Loading…'
              : !data.hasLocation
                ? 'Add the site’s latitude and longitude in Edit details to start recording.'
                : data.recording
                  ? 'Recorded every day for the life of the project.'
                  : 'Recording stopped when the project was closed.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            From
            <input type="date" className={`${inputClass} mt-0.5 block`} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input type="date" className={`${inputClass} mt-0.5 block`} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="h-9 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Latest
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {data && days.length === 0 && data.hasLocation && (
        <p className="mt-3 text-sm text-slate-400">{from || to ? 'Nothing recorded for those dates.' : 'The first day will appear within a few hours.'}</p>
      )}

      {days.length > 0 && (
        <>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {days.length} day{days.length === 1 ? '' : 's'} shown · {rainDays} with 1 mm of rain or more
          </p>
          <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Day</th>
                  <th className="px-3 py-2 font-medium">Conditions</th>
                  <th className="px-3 py-2 text-right font-medium">High / low °C</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <Droplets size={12} className="inline" aria-hidden /> Rain mm
                  </th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                    <Wind size={12} className="inline" aria-hidden /> Wind km/h
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {days.map((d) => {
                  const w = d.weatherCode == null ? null : describeWeather(d.weatherCode);
                  const Icon = w?.icon ?? CloudSun;
                  return (
                    <tr key={d.id} className="text-slate-700 dark:text-slate-200">
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {dayLabel(d.date)}
                        {!d.isComplete && <span className="ml-1 text-xs text-slate-400">(so far)</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <Icon size={14} className="shrink-0 text-slate-400" aria-hidden />
                          {w?.label ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {round(d.tempMaxC)} / {round(d.tempMinC)}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${(d.precipitationMm ?? 0) >= 1 ? 'font-medium text-sky-700 dark:text-sky-300' : ''}`}>
                        {d.precipitationMm == null ? '—' : d.precipitationMm.toFixed(1)}
                      </td>
                      <td className="hidden px-3 py-1.5 text-right tabular-nums sm:table-cell">{round(d.windMaxKmh)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
