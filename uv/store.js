// Everything personal stays in this browser (localStorage). Nothing is sent anywhere.
const NS = "uv:";
export function load(key, fallback = null) { try { const v = localStorage.getItem(NS + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
export function save(key, value) { try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* full or blocked: the app still works for this visit */ } }
export function clearAll() { try { Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k)); } catch {} }

export const DEFAULTS = {
  settings: { theme: "auto", showTrackerHint: true, reminders: true, installHintDismissed: false, weather: true },
  skin: { type: 3, env: "none", spf: 30, vitaminDGoal: 1000, chosen: false },
  place: null,          // { name, region, lat, lon, current: true|false }
  recent: [],           // up to 10 places
  session: null,        // { id, start, spf, appliedAt, env, place }
  log: [],              // finished sessions: { id, start, end, minutes, dose, iu, spf, env, place }
};
export const get = (k) => { const v = load(k); return v == null ? structuredClone(DEFAULTS[k]) : (typeof DEFAULTS[k] === "object" && DEFAULTS[k] && !Array.isArray(DEFAULTS[k]) ? { ...DEFAULTS[k], ...v } : v); };
export const set = (k, v) => save(k, v);
