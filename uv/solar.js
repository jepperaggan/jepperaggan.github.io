// Sun position (NOAA approximation). No dependencies. Times are UTC milliseconds.
const rad = Math.PI / 180, deg = 180 / Math.PI;
function sunCoords(ms) {
  const d = ms / 86400000 + 2440587.5 - 2451545.0;            // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad;                  // mean anomaly
  const q = 280.459 + 0.98564736 * d;                          // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;    // hours
  return { ra, dec, gmst };
}
/** Solar elevation in degrees at a UTC time and place. */
export function elevation(ms, lat, lon) {
  const { ra, dec, gmst } = sunCoords(ms);
  const ha = (gmst * 15 + lon) * rad - ra;
  const s = Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, s))) * deg;
}
/** Sunrise, solar noon and sunset for one local day, as minutes after local midnight.
 *  dayStartMs = the UTC ms of local midnight. Scans by minute (fast enough: 1440 steps). */
export function sunTimes(dayStartMs, lat, lon) {
  let rise = null, set = null, noon = 0, best = -91, prev = elevation(dayStartMs, lat, lon);
  for (let m = 1; m <= 1440; m++) {
    const e = elevation(dayStartMs + m * 60000, lat, lon);
    if (prev < -0.833 && e >= -0.833 && rise == null) rise = m;
    if (prev >= -0.833 && e < -0.833) set = m;
    if (e > best) { best = e; noon = m; }
    prev = e;
  }
  return { rise, noon, set, maxElevation: best, polar: rise == null && set == null ? (best > 0 ? "day" : "night") : null };
}
