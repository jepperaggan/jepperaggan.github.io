// Exposure model. Pure functions; estimates, not medical advice.
// Erythemal irradiance E = UVI × 0.025 W/m². 1 SED = 100 J/m².
// Burn limits (MED) per Fitzpatrick type, J/m². Type III is calibrated so UV 3 without sunscreen gives about 1 t 29 min.
export const MED = { 1: 200, 2: 250, 3: 400, 4: 500, 5: 800, 6: 1500 };
// Vitamin D (IU per SED of exposure, typical face, arms and hands). Type III calibrated: UV 3 → 1 000 IU in about 64 min.
export const IU_PER_SED = { 1: 400, 2: 380, 3: 347, 4: 280, 5: 200, 6: 130 };
export const ENV = { none: 1, city: 1.1, sand: 1.2, snow: 1.6 };
export const SPF_HOURS = 2;
// UV rises about 10 % per 1 000 m of altitude (WHO, Global Solar UV Index guide).
export const ALT_PER_KM = 0.10;
/** Factor for being at `altitude` m when the forecast is for a point at `base` m. */
export const altitudeFactor = (altitude, base) => (altitude == null || base == null ? 1 : Math.max(0.5, 1 + (ALT_PER_KM * (altitude - base)) / 1000));                                    // reapply after this

/** Effective protection factor `minutes` after applying sunscreen with this SPF. Falls to a quarter by SPF_HOURS. */
export function spfFactor(spf, minutesSinceApplied) {
  if (!spf || minutesSinceApplied == null || minutesSinceApplied < 0) return 1;
  const left = 1 - 0.75 * Math.min(1, minutesSinceApplied / (SPF_HOURS * 60));
  return Math.max(1, spf * left);
}
/** Erythemal dose in J/m² for one minute. */
export const dosePerMinute = (uv, env = "none", spf = 1) => (Math.max(0, uv) * 0.025 * 60 * (ENV[env] ?? 1)) / spf;
/** Vitamin D in IU for one minute. Sunscreen blocks it too. */
export const iuPerMinute = (uv, skin, env = "none", spf = 1) => (dosePerMinute(uv, env, spf) / 100) * IU_PER_SED[skin];

/**
 * Minutes until the burn limit is reached, walking forward through the day's UV.
 * uvAt(minute) gives UV at a local minute; returns null if it is not reached before `endMin`.
 */
export function minutesToBurn({ uvAt, fromMin, skin, env = "none", doseSoFar = 0, spf = 0, appliedAtMin = null, endMin = 24 * 60 }) {
  let dose = doseSoFar;
  for (let m = fromMin; m < endMin; m++) {
    dose += dosePerMinute(uvAt(m), env, spfFactor(spf, appliedAtMin == null ? null : m - appliedAtMin));
    if (dose >= MED[skin]) return m + 1 - fromMin;
  }
  return null;
}
/** Minutes outside until `goalIU` of vitamin D, or null if not reached today. */
export function minutesToVitaminD({ uvAt, fromMin, skin, env = "none", iuSoFar = 0, goalIU, spf = 0, appliedAtMin = null, endMin = 24 * 60 }) {
  let iu = iuSoFar;
  if (iu >= goalIU) return 0;
  for (let m = fromMin; m < endMin; m++) {
    iu += iuPerMinute(uvAt(m), skin, env, spfFactor(spf, appliedAtMin == null ? null : m - appliedAtMin));
    if (iu >= goalIU) return m + 1 - fromMin;
  }
  return null;
}
/** Sum a session (or part of one) minute by minute. */
export function sessionTotals({ uvAt, fromMin, toMin, skin, env = "none", spf = 0, appliedAtMin = null }) {
  let dose = 0, iu = 0;
  for (let m = fromMin; m < toMin; m++) {
    const f = spfFactor(spf, appliedAtMin == null ? null : m - appliedAtMin);
    dose += dosePerMinute(uvAt(m), env, f);
    iu += iuPerMinute(uvAt(m), skin, env, f);
  }
  return { dose, iu, minutes: Math.max(0, toMin - fromMin) };
}
/** SPF to suggest for a peak UV. */
export const recommendedSpf = (peak) => (peak < 3 ? 0 : peak < 6 ? 30 : 50);
