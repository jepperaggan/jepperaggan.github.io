// Forecast data: Open-Meteo, straight from the browser (no key, CORS allowed).
// Primary: Forecast API (8 days, UV + weather). Backup: Air Quality API (CAMS, 5 days, UV only).
// Normalised shape (all times local to the place, minutes after local midnight):
// { lat, lon, tz, offsetMin, source, fetchedAt, days: [{ date, startMs, hours: [{ min, uv, clear, cloud, code, temp }],
//   rise, noon, set, polar, peak: { min, uv }, window: { from, to } | null }] }
import { sunTimes, elevation } from "./solar.js";
import { load, save } from "./store.js";

const FRESH_MS = 15 * 60 * 1000;
export const r1 = (v) => Math.round(v * 10) / 10;
export const gridKey = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

async function getJson(url, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}
export function fromForecastApi(j) {
  const h = j.hourly;
  return { tz: j.timezone, offsetMin: j.utc_offset_seconds / 60, source: "Open-Meteo",
    rows: h.time.map((t, i) => ({ t, uv: h.uv_index[i], clear: h.uv_index_clear_sky?.[i], cloud: h.cloud_cover?.[i], code: h.weather_code?.[i], temp: h.temperature_2m?.[i] })) };
}
export function fromAirApi(j) {
  const h = j.hourly;
  return { tz: j.timezone, offsetMin: j.utc_offset_seconds / 60, source: "Open-Meteo (CAMS)",
    rows: h.time.map((t, i) => ({ t, uv: h.uv_index[i], clear: h.uv_index_clear_sky?.[i] })) };
}
export function shape({ tz, offsetMin, source, rows }, lat, lon) {
  const byDay = new Map();
  for (const r of rows) {
    if (r.uv == null) continue;
    const [date, hm] = r.t.split("T"); const [hh, mm] = hm.split(":").map(Number);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push({ min: hh * 60 + mm, uv: Math.max(0, r.uv), clear: r.clear, cloud: r.cloud, code: r.code, temp: r.temp });
  }
  const days = [];
  for (const [date, hours] of byDay) {
    if (hours.length < 12) continue;                         // a partial day at the edge of the range
    const [y, mo, d] = date.split("-").map(Number);
    const startMs = Date.UTC(y, mo - 1, d) - offsetMin * 60000;
    const sun = sunTimes(startMs, lat, lon);
    const day = { date, startMs, hours, ...sun };
    const uvAt = curve(day, lat, lon);
    let peak = { min: 0, uv: 0 }, from = null, to = null;
    for (let m = 0; m < 1440; m += 5) { const v = uvAt(m); if (v > peak.uv) peak = { min: m, uv: v };
      if (r1(v) >= 3) { if (from == null) from = m; to = m; } }
    day.peak = { min: peak.min, uv: r1(peak.uv) };
    day.window = from == null ? null : { from: Math.floor(from / 5) * 5, to: Math.ceil(to / 5) * 5 };
    days.push(day);
  }
  return { lat, lon, tz, offsetMin, source, fetchedAt: Date.now(), days };
}
/**
 * UV at any minute of a day. Hourly values are interpolated against the sun's height, so the curve
 * follows the sun minute by minute and is zero at sunrise and sunset (no "20 minutes off").
 */
export function curve(day, lat, lon, clear = false) {
  const key = clear ? "_uvClear" : "_uvAt";
  if (day[key]) return day[key];
  const f = (m) => { const e = elevation(day.startMs + m * 60000, lat, lon); return e <= 0 ? 0 : Math.pow(Math.sin(e * Math.PI / 180), 1.3); };
  // clear = true: the UV a cloudless sky would give (weather off). Falls back to the cloudy value when a source has none.
  const pts = day.hours.map((h) => ({ min: h.min, uv: clear ? (h.clear ?? h.uv) : h.uv, f: f(h.min) }));
  const k = pts.map((p) => (p.f > 0.03 ? p.uv / p.f : null));
  for (let i = 0; i < k.length; i++) if (k[i] == null) { let j = 1; while (j < k.length) { const a = k[i - j], b = k[i + j]; if (a != null || b != null) { k[i] = a ?? b; break; } j++; } k[i] ??= 0; }
  const fn = (m) => {
    if (m <= pts[0].min) return k[0] * f(m);
    for (let i = 1; i < pts.length; i++) if (m <= pts[i].min) {
      const t = (m - pts[i - 1].min) / (pts[i].min - pts[i - 1].min);
      return Math.max(0, (k[i - 1] + (k[i] - k[i - 1]) * t) * f(m));
    }
    return k.at(-1) * f(m);
  };
  Object.defineProperty(day, key, { value: fn, enumerable: false });
  return fn;
}
/** Peak and protection window (UV ≥ 3) for any UV function over a day. */
export function dayStats(uvAt) {
  let peak = { min: 0, uv: 0 }, from = null, to = null;
  for (let m = 0; m < 1440; m += 5) { const v = uvAt(m); if (v > peak.uv) peak = { min: m, uv: v }; if (r1(v) >= 3) { if (from == null) from = m; to = m; } }
  return { peak: { min: peak.min, uv: r1(peak.uv) }, window: from == null ? null : { from: Math.floor(from / 5) * 5, to: Math.ceil(to / 5) * 5 } };
}
/** Local minutes after midnight and the local date string, now, at a place. */
export function localNow(fc, now = Date.now()) {
  const local = new Date(now + fc.offsetMin * 60000);
  return { date: local.toISOString().slice(0, 10), min: local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60 };
}
export function todayIndex(fc, now = Date.now()) {
  const { date } = localNow(fc, now); const i = fc.days.findIndex((d) => d.date === date); return i < 0 ? 0 : i;
}

/** Forecast for a place: cached copy at once (onCached), then a fresh one when the cache is older than 15 min. */
export async function getForecast(lat, lon, { force = false, onCached } = {}) {
  const key = `fc:${gridKey(lat, lon)}`;
  const cached = load(key);
  if (cached) { onCached?.(cached); if (!force && Date.now() - cached.fetchedAt < FRESH_MS) return cached; }
  const q = `latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&timezone=auto`;
  let fc;
  try {
    fc = shape(fromForecastApi(await getJson(`https://api.open-meteo.com/v1/forecast?${q}&forecast_days=8&hourly=uv_index,uv_index_clear_sky,cloud_cover,weather_code,temperature_2m`)), lat, lon);
  } catch (e1) {
    try { fc = shape(fromAirApi(await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&forecast_days=5&hourly=uv_index,uv_index_clear_sky`)), lat, lon); }
    catch (e2) { if (cached) return { ...cached, stale: true }; throw e2; }
  }
  save(key, fc);
  return fc;
}

export async function searchPlaces(q, lang = "nb") {
  if (q.trim().length < 2) return [];
  const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=10&language=${lang}&format=json`);
  const seen = new Set();
  return (j.results || []).map((r) => ({ name: r.name, region: [r.admin1, r.country].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude, tz: r.timezone }))
    .filter((p) => { const k = `${p.name}|${p.region}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
export async function placeName(lat, lon, lang = "nb") {
  const key = `rg:${gridKey(lat, lon)}`; const hit = load(key); if (hit) return hit;
  try {
    const j = await getJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`, 8000);
    const p = { name: j.city || j.locality || j.principalSubdivision || "Her", region: [j.principalSubdivision, j.countryName].filter(Boolean).join(", ") };
    save(key, p); return p;
  } catch { return { name: "Min posisjon", region: "" }; }
}
export function locate() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }), rej, { maximumAge: 10 * 60000, timeout: 10000, enableHighAccuracy: false });
  });
}
