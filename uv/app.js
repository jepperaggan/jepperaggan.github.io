// UV: app shell, views and state. Data in forecast.js, maths in exposure.js, drawing in ui.js.
import { gauge, dayChart, bandOf, fmt1, clock, dur, BANDS, spring, project, rubberband, haptic, reducedMotion } from "./ui.js";
import { getForecast, curve, localNow, todayIndex, searchPlaces, placeName, locate, r1 } from "./forecast.js";
import { minutesToBurn, minutesToVitaminD, sessionTotals, spfFactor, recommendedSpf, SPF_HOURS, MED } from "./exposure.js";
import { get, set, clearAll } from "./store.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nb = (v, d = 0) => Number(v).toLocaleString("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d });
const icon = (id, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const WEEKDAY = ["søn", "man", "tir", "ons", "tor", "fre", "lør"], MONTH = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const dayName = (date, i) => { const d = new Date(date + "T12:00Z"); const s = `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTH[d.getUTCMonth()]}`; return i === 0 ? "I dag" : i === 1 ? "I morgen" : s[0].toUpperCase() + s.slice(1); };
const SKIN = { 1: "Blir alltid brent, blir aldri brun", 2: "Blir lett brent, litt brun", 3: "Blir av og til brent, blir brun", 4: "Sjelden brent, blir lett brun", 5: "Svært sjelden brent", 6: "Nesten aldri brent" };
const SKIN_SW = { 1: "#f1d9c6", 2: "#e4bf9f", 3: "#c99a72", 4: "#a0704a", 5: "#6e4a30", 6: "#3f2a1d" };
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
const QUICK = [["Oslo", 59.91, 10.75], ["Bergen", 60.39, 5.32], ["Trondheim", 63.43, 10.39], ["Stavanger", 58.97, 5.73], ["Tromsø", 69.65, 18.96]].map(([name, lat, lon]) => ({ name, lat, lon, region: "Norge" }));
const ENVS = [["none", "Ingen"], ["city", "By"], ["sand", "Sand"], ["snow", "Snø"]];
const ENV_LONG = { none: "Vanlig underlag", city: "By (+10 % UV)", sand: "Sand eller vann (+20 % UV)", snow: "Snø (+60 % UV)" };

const S = { fc: null, error: null, loading: true, view: "uv", g: null, chart: null, locating: false };
let skin = get("skin"), settings = get("settings"), place = get("place"), session = get("session"), log = get("log"), sunscreen = get("sunscreen") || null;

// ---------- derived values ----------
function ctx() {
  const fc = S.fc; if (!fc) return null;
  const now = localNow(fc), ti = todayIndex(fc), day = fc.days[ti], uvAt = curve(day, fc.lat, fc.lon);
  const night = day.polar === "night" || (day.set != null && now.min > day.set) || (day.rise != null && now.min < day.rise - 20);
  const uv = night ? 0 : uvAt(now.min);
  const msToMin = (ms) => localNow(fc, ms).min;
  const sameDay = (ms) => localNow(fc, ms).date === now.date;
  // today's exposure: finished sessions plus the running one
  const spfNow = sunscreen && sameDay(sunscreen.at) ? { spf: sunscreen.spf, at: msToMin(sunscreen.at) } : { spf: 0, at: null };
  const todays = log.filter((s) => sameDay(s.start));
  let dose = todays.reduce((a, s) => a + s.dose, 0), iu = todays.reduce((a, s) => a + s.iu, 0), minutes = todays.reduce((a, s) => a + s.minutes, 0);
  let live = null;
  if (session) {
    const from = sameDay(session.start) ? msToMin(session.start) : 0;
    live = sessionTotals({ uvAt, fromMin: Math.floor(from), toMin: Math.floor(now.min), skin: skin.type, env: session.env, spf: spfNow.spf, appliedAtMin: spfNow.at });
    dose += live.dose; iu += live.iu; minutes += live.minutes;
  }
  const burnIn = night ? null : minutesToBurn({ uvAt, fromMin: Math.floor(now.min), skin: skin.type, env: skin.env, doseSoFar: dose, spf: spfNow.spf, appliedAtMin: spfNow.at, endMin: day.set ?? 1440 });
  const burnFresh = night ? null : minutesToBurn({ uvAt, fromMin: Math.floor(now.min), skin: skin.type, env: skin.env, endMin: day.set ?? 1440 });
  const vdIn = night ? null : minutesToVitaminD({ uvAt, fromMin: Math.floor(now.min), skin: skin.type, env: skin.env, iuSoFar: iu, goalIU: skin.vitaminDGoal, spf: spfNow.spf, appliedAtMin: spfNow.at, endMin: day.set ?? 1440 });
  const reapplyAt = spfNow.spf ? spfNow.at + SPF_HOURS * 60 : null;
  const over = dose >= MED[skin.type];
  return { over, fc, now, ti, day, uvAt, uv, night, dose, iu, minutes, live, burnIn, burnFresh, vdIn, spfNow, reapplyAt, todays, tomorrow: fc.days[ti + 1] };
}
const winText = (w) => (w ? `${clock(w.from)}–${clock(w.to)}` : null);
function finding(c) {
  if (c.night) { const t = c.tomorrow; return t ? `Sola er nede. I morgen høyest ${fmt1(t.peak.uv)} kl. ${clock(t.peak.min)}${t.window ? `, beskytt deg ${winText(t.window)}` : ""}.` : "Sola er nede."; }
  const w = c.day.window;
  if (!w) return `Lav UV hele dagen. Høyest ${fmt1(c.day.peak.uv)} kl. ${clock(c.day.peak.min)}.`;
  if (c.now.min > w.to) return `Beskyttelse trengtes ${winText(w)}. Nå er UV under 3.`;
  return `Beskytt deg ${winText(w)}. Høyest ${fmt1(c.day.peak.uv)} kl. ${clock(c.day.peak.min)}.`;
}
const burnText = (m) => (m == null ? "Ikke i dag" : dur(m));

// ---------- views ----------
function titleRow(id, title, sub, action = true) {
  const running = !!session;
  return `<div class="title-row"><div>
      <h1 id="t-${id}" tabindex="-1">${title}</h1>
      <p class="sub">${sub}</p></div>
      ${action ? `<button class="btn primary" data-act="${running ? "stop" : "start"}">${icon(running ? "i-stop" : "i-play")}${running ? "Stopp soltid" : "Start soltid"}</button>` : ""}
    </div>`;
}
const placeTitle = () => place
  ? `<button class="place-btn" data-act="places" aria-label="Bytt sted, nå ${esc(place.name)}">${icon(place.current ? "i-pin" : "i-map")}${esc(place.name)}${icon("i-chev", "i chev")}</button>`
  : `<button class="place-btn" data-act="places">${icon("i-map")}Velg sted${icon("i-chev", "i chev")}</button>`;

function viewUV() {
  const v = $("#v-uv"); S.chart?.destroy?.(); S.chart = null;
  if (!S.fc) { v.innerHTML = titleRow("uv", placeTitle(), S.error ? "" : `<span class="skel">Henter prognosen</span>`, false) + emptyOrError(); return; }
  const c = ctx(), wide = matchMedia("(min-width: 900px)").matches;
  const chartDay = c.night && c.tomorrow && (c.now.min > (c.day.set ?? 0)) ? c.tomorrow : c.day, chartIsToday = chartDay === c.day;
  const t = c.tomorrow;
  v.innerHTML = titleRow("uv", placeTitle(), esc(finding(c))) + installHint() + `
    <div class="grid">
      <section class="panel s5 stretch" aria-labelledby="h-now">
        <header><h2 id="h-now">Nå</h2><span class="meta num">${stamp()}</span></header>
        <div class="reading"><div id="gauge"></div>
          <p class="burn">${c.night ? `<span class="muted">Sola er nede</span><b class="num">${c.tomorrow?.rise != null ? `Opp ${clock(c.tomorrow.rise)}` : "–"}</b><span class="muted">Ingen UV før i morgen</span>`
            : `<span class="muted">${c.over ? "Grensen for solbrenthet" : c.spfNow.spf ? `Solbrent om, med SPF ${c.spfNow.spf}` : "Solbrent om, uten solkrem"}</span><b class="num">${c.over ? "Nådd" : burnText(c.burnIn)}</b><span class="muted">Hudtype ${ROMAN[skin.type]}${skin.env !== "none" ? ` · ${ENVS.find((e) => e[0] === skin.env)[1].toLowerCase()}` : ""}</span>`}</p>
        </div>
      </section>
      <section class="panel s7 stretch" aria-labelledby="h-day">
        <header><h2 id="h-day">${chartIsToday ? "I dag" : "I morgen"}</h2><span class="meta">Dra for å se et annet klokkeslett</span></header>
        <div id="day"></div>
        <p class="muted" style="margin-top:10px">${sunLine(chartDay)}</p>
      </section>
      <section class="kpis s12" aria-label="Din dag">
        <div class="kpi"><span class="kpi-label">Sol i dag</span><span class="kpi-value num">${nb(Math.round(c.minutes))}<small>min</small></span><span class="note">${session ? `Pågår siden ${clock(localNow(c.fc, session.start).min)}` : c.minutes ? "Ikke aktiv nå" : "Ikke startet"}</span></div>
        <div class="kpi"><span class="kpi-label">Vitamin D</span><span class="kpi-value num">${nb(Math.min(c.iu, 99999))}<small>av ${nb(skin.vitaminDGoal)} IE</small></span>
          <div class="prog" aria-hidden="true"><i style="width:${Math.min(100, (c.iu / skin.vitaminDGoal) * 100).toFixed(1)}%"></i></div>
          <span class="note">${c.iu >= skin.vitaminDGoal ? "Dagens mål er nådd" : c.vdIn == null ? "Ikke nok UV i dag" : `Ca. ${dur(c.vdIn)} ute ved dagens UV`}</span></div>
        <div class="kpi"><span class="kpi-label">Solkrem</span><span class="kpi-value">${c.spfNow.spf ? `SPF ${c.spfNow.spf}` : "Ingen"}</span>
          <span class="note">${c.spfNow.spf ? `Smør på igjen ${clock(c.reapplyAt)}` : recommendedSpf(c.day.peak.uv) ? `SPF ${recommendedSpf(c.day.peak.uv)} anbefales i dag` : "Ikke nødvendig i dag"}</span>
          <button class="card-link" data-act="sunscreen">${c.spfNow.spf ? "Endre" : "Registrer"}</button></div>
        <div class="kpi"><span class="kpi-label">I morgen</span>${t ? `<span class="kpi-value num">${fmt1(t.peak.uv)}<small>høyest kl. ${clock(t.peak.min)}</small></span>
          <span class="note">${t.window ? `Beskytt deg <span class="nw">${winText(t.window)}</span>` : "Lav UV hele dagen"}</span>` : `<span class="kpi-value">–</span>`}
          <a class="card-link" href="#/prognose">${c.fc.days.length - c.ti} dager</a></div>
      </section>
    </div>`;
  S.g = gauge($("#gauge"));
  S.g.set(c.uv, { instant: true });
  S.chart = dayChart($("#day"), { ...chartDay, now: c.now.min }, { uvAt: curve(chartDay, c.fc.lat, c.fc.lon), isToday: chartIsToday, height: wide ? 300 : 200,
    onScrub: (uv) => S.g.set(uv), onRelease: () => S.g.set(ctx().uv) });
}
const sunLine = (d) => d.polar === "night" ? "Sola står ikke opp i dag." : d.polar === "day" ? "Sola går ikke ned i dag." : `Sola står opp ${clock(d.rise)} og går ned ${clock(d.set)}.`;
const stamp = () => S.fc ? `${S.fc.stale ? "Uten nett · " : ""}Oppdatert ${clock(localNow(S.fc, S.fc.fetchedAt).min)}` : "";

function emptyOrError() {
  if (S.error === "location") return `<section class="panel err"><h2>Vi vet ikke hvor du er</h2><p class="muted">Gi nettleseren tilgang til posisjon, søk etter et sted, eller velg en by.</p>
    <div class="hstack"><button class="btn primary" data-act="places">Søk etter sted</button><button class="btn secondary" data-act="locate">Bruk posisjonen min</button></div>
    <div class="chips" style="margin-top:8px">${QUICK.map((p, i) => `<button class="chip" data-act="quick" data-i="${i}">${p.name}</button>`).join("")}</div></section>`;
  if (S.error) return `<section class="panel err"><h2>Fikk ikke hentet prognosen</h2><p class="muted">Sjekk nettet og prøv igjen.</p><button class="btn secondary" data-act="retry">Prøv igjen</button></section>`;
  return `<div class="grid"><section class="panel s5" style="height:420px" aria-busy="true"><span class="skel" style="width:40%;height:22px"></span></section><section class="panel s7" style="height:420px" aria-busy="true"><span class="skel" style="width:30%;height:22px"></span></section></div>`;
}

function viewHud() {
  const v = $("#v-hud");
  if (!S.fc) { v.innerHTML = titleRow("hud", "Hud og soltid", "") + emptyOrError(); return; }
  const c = ctx(), lim = MED[skin.type], frac = c.dose / lim;
  const vdDose = (skin.vitaminDGoal / { 1: 400, 2: 380, 3: 347, 4: 280, 5: 200, 6: 130 }[skin.type]) * 100; // J/m² that gives the goal
  const sub = c.over ? "Du har nådd grensen for solbrenthet i dag. Gå i skyggen." : c.night ? "Sola er nede. Ingen UV før i morgen." : c.burnIn == null ? "Du blir ikke solbrent i dag ved denne UV-en." : `${c.spfNow.spf ? `Med SPF ${c.spfNow.spf}` : "Uten solkrem"} kan du bli solbrent om ${dur(c.burnIn)}.`;
  v.innerHTML = titleRow("hud", "Hud og soltid", esc(sub)) + `
    <div class="grid">
      <section class="panel s7" aria-labelledby="h-soltid">
        <header><h2 id="h-soltid">Soltid i dag</h2><span class="meta">${session ? `Pågår siden ${clock(localNow(c.fc, session.start).min)}` : "Ikke aktiv"}</span></header>
        <p class="lead">${nb(Math.round(c.minutes))}<small>min i sola</small></p>
        ${vdDose < lim ? `<div class="plan-top"><span style="left:${Math.min(88, Math.max(12, (vdDose / lim) * 100)).toFixed(1)}%">Vitamin D-mål</span></div>` : ""}
        <div class="plan" role="meter" aria-label="Soltid mot grensen for solbrenthet" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(frac, 1) * 100)}" aria-valuetext="${Math.round(frac * 100)} % av grensen for solbrenthet">
          <span class="done${frac >= 1 ? " over" : ""}" style="width:${Math.min(100, frac * 100).toFixed(1)}%"></span>
          ${vdDose < lim ? `<span class="goal" style="left:${((vdDose / lim) * 100).toFixed(1)}%" title="Vitamin D-mål"></span>` : ""}</div>
        <div class="plan-l"><span>0</span><span>Solbrent</span></div>
        ${vdDose >= lim ? `<p class="note">Vitamin D-målet ditt ligger over grensen for solbrenthet for hudtype ${ROMAN[skin.type]}. Ta resten fra mat eller tilskudd.</p>` : ""}
        <div class="rows" style="margin-top:12px">
          <div class="row"><span class="grow">Brukt av grensen</span><span class="val">${nb(Math.round(frac * 100))} %</span></div>
          <div class="row"><span class="grow">Vitamin D</span><span class="val">${nb(c.iu)} av ${nb(skin.vitaminDGoal)} IE</span></div>
          <div class="row"><span class="grow">Solkrem<small>${c.spfNow.spf ? `Påført ${clock(c.spfNow.at)} · smør på igjen ${clock(c.reapplyAt)}` : "Ingen registrert i dag"}</small></span><button class="btn secondary" data-act="sunscreen">${c.spfNow.spf ? "Smurt på igjen" : "Registrer"}</button></div>
          ${session ? `<div class="row"><span class="grow">Startet ${clock(localNow(c.fc, session.start).min)}<small>Glemte du å starte i tide?</small></span><button class="btn secondary" data-act="edit-start">Endre start</button></div>` : ""}
        </div>
      </section>
      <section class="panel s5" aria-labelledby="h-skin">
        <header><h2 id="h-skin">Din hud</h2></header>
        <div class="rows">
          <div class="row"><span class="grow">Hudtype ${ROMAN[skin.type]}<small>${SKIN[skin.type]}</small></span><button class="value-btn" data-act="skin">Endre</button></div>
          <div class="row"><span class="grow">Vitamin D-mål<small>${nb(skin.vitaminDGoal / 40, 0)} µg per dag</small></span><button class="value-btn num" data-act="vitd">${nb(skin.vitaminDGoal)} IE</button></div>
          <div class="row row-ctl"><span class="grow">Underlag<small>Snø, sand og vann kaster UV tilbake</small></span>
            <div class="seg" role="radiogroup" aria-label="Underlag">${ENVS.map(([k, l]) => `<button role="radio" aria-checked="${skin.env === k}" data-env="${k}">${l}</button>`).join("")}</div></div>
        </div>
        ${skin.chosen ? "" : `<p class="note" style="margin-top:8px">Hudtype III er valgt som standard. Velg din egen for riktigere tider.</p>`}
      </section>
      <section class="panel s12" aria-labelledby="h-log">
        <header><h2 id="h-log">Logg</h2><span class="meta">Siste 14 dager</span></header>
        ${logRows(c)}
      </section>
    </div>
    <p class="note" style="margin-top:16px">Tidene er anslag ut fra UV-prognosen, hudtypen og solkremen du har valgt. De er ikke medisinske råd.</p>`;
}
function logRows(c) {
  const cut = Date.now() - 14 * 86400000, rows = log.filter((s) => s.start > cut).slice(-20).reverse();
  if (!rows.length) return `<p class="muted">Ingen økter ennå. Trykk «Start soltid» når du går ut.</p>`;
  return `<div class="rows">${rows.map((s) => { const d = localNow(c.fc, s.start);
    return `<div class="row"><span class="grow">${dayName(d.date, d.date === c.now.date ? 0 : -1)} · ${clock(d.min)}–${clock(localNow(c.fc, s.end).min)}<small>${nb(s.minutes)} min · ${nb(Math.round((s.dose / MED[skin.type]) * 100))} % av grensen · ${nb(s.iu)} IE</small></span>
      <button class="btn text" data-act="edit-log" data-id="${s.id}">Endre</button></div>`; }).join("")}</div>`;
}

function viewPrognose() {
  const v = $("#v-prognose");
  if (!S.fc) { v.innerHTML = titleRow("prognose", "Prognose", "", false) + emptyOrError(); return; }
  const c = ctx(), days = c.fc.days.slice(c.ti);
  const next = days.find((d, i) => i > 0 && d.window);
  const sub = next ? `Neste dag med UV over 3: ${dayName(next.date, days.indexOf(next)).toLowerCase()} (${fmt1(next.peak.uv)}).` : `Ingen dager med UV over 3 de neste ${days.length - 1} dagene.`;
  v.innerHTML = titleRow("prognose", `Prognose · ${esc(place?.name ?? "")}`, esc(sub), false) + `
    <div class="grid">
      ${days.slice(0, 2).map((d, i) => `<section class="panel s6" aria-labelledby="h-d${i}">
        <header><h2 id="h-d${i}">${dayName(d.date, i)}</h2><span class="meta num">Høyest ${fmt1(d.peak.uv)} kl. ${clock(d.peak.min)}</span></header>
        <p class="muted" style="margin-bottom:8px">${d.window ? `Beskytt deg <span class="nw">${winText(d.window)}</span>` : "Lav UV hele dagen"}</p>
        <div class="chart" id="bars-${i}"></div></section>`).join("")}
      <section class="panel s12" aria-labelledby="h-days">
        <header><h2 id="h-days">Kommende dager</h2><span class="meta">${esc(c.fc.source)}</span></header>
        <div class="rows">${days.slice(2).map((d, i) => `<button class="place-row" data-act="day" data-i="${c.ti + i + 2}">
            <span class="dot" style="--c:${d.peak.uv >= 3 ? `var(--uv-${bandOf(d.peak.uv).id})` : "var(--chart-muted)"}"></span>
            <span class="grow"><span>${dayName(d.date, i + 2)}</span><small>${d.window ? `Beskytt deg ${winText(d.window)}` : "Lav hele dagen"}</small></span>
            <span class="val num">${fmt1(d.peak.uv)}</span></button>`).join("") || `<p class="muted">Kilden gir bare to dager nå.</p>`}</div>
      </section>
    </div>`;
  days.slice(0, 2).forEach((d, i) => drawBars($(`#bars-${i}`), d));
}
function drawBars(el, d) {
  const hrs = d.hours.filter((h) => h.min >= Math.floor(((d.rise ?? 360) - 30) / 60) * 60 && h.min <= Math.ceil(((d.set ?? 1260) + 30) / 60) * 60);
  if (!hrs.length || !window.Charts) return;
  const colour = getComputedStyle(document.documentElement).getPropertyValue(`--uv-${bandOf(Math.max(3, d.peak.uv)).id}`).trim();
  window.Charts.bars(el, { labels: hrs.map((h) => clock(h.min)), values: hrs.map((h) => r1(h.uv)), highlight: hrs.map((h, i) => (r1(h.uv) >= 3 ? i : -1)).filter((i) => i >= 0),
    colour, format: (v) => nb(v, 1), tickFormat: (v) => nb(v, Number.isInteger(v) ? 0 : 1), height: 160, reference: { value: 3, label: "UV 3" } });
}

function viewSettings() {
  const v = $("#v-innstillinger");
  v.innerHTML = titleRow("innstillinger", "Innstillinger", "Alt du velger her lagres bare på denne enheten.", false) + `
    <div class="stack">
      <section class="panel" aria-labelledby="h-look"><header><h2 id="h-look">Utseende</h2></header>
        <div class="set-row"><span class="grow"><b>Tema</b><span>Følger telefonen, eller alltid lyst eller mørkt.</span></span>
          <div class="seg" role="radiogroup" aria-label="Tema">${[["auto", "Auto"], ["light", "Lyst"], ["dark", "Mørkt"]].map(([k, l]) => `<button role="radio" aria-checked="${settings.theme === k}" data-theme-set="${k}">${l}</button>`).join("")}</div></div>
      </section>
      <section class="panel" aria-labelledby="h-rem"><header><h2 id="h-rem">Påminnelser</h2></header>
        <div class="set-row"><span class="grow"><b>Smør på solkrem igjen</b><span>Et varsel ${SPF_HOURS} timer etter at du registrerte solkrem, og når du nærmer deg grensen. Virker mens appen er åpen.</span></span>
          <button class="switch" role="switch" aria-checked="${settings.reminders}" aria-label="Påminnelser om solkrem" data-act="reminders"></button></div>
        <div class="set-row"><span class="grow"><b>Varsel når UV passerer et nivå</b><span>Kommer snart. Krever at appen er lagt på hjemskjermen.</span></span>
          <button class="value-btn" disabled aria-disabled="true">UV 3</button></div>
      </section>
      <section class="panel" aria-labelledby="h-data"><header><h2 id="h-data">Data</h2></header>
        <div class="set-row"><span class="grow"><b>Prognose</b><span>${S.fc ? `${esc(S.fc.source)}, ${stamp().toLowerCase()}` : "Open-Meteo"}. UV-skalaen følger WHO.</span></span>
          <button class="btn secondary" data-act="retry">Oppdater</button></div>
        <div class="set-row"><span class="grow"><b>Slett alle data</b><span>Fjerner hudtype, logg, steder og innstillinger fra denne enheten.</span></span>
          <button class="btn text danger-text" data-act="wipe">Slett</button></div>
      </section>
      <p class="note">Tider for solbrenthet og vitamin D er anslag, ikke medisinske råd. Værdata: <a href="https://open-meteo.com" style="text-decoration:underline">Open-Meteo</a> (CC BY 4.0). Stedsnavn: Open-Meteo og BigDataCloud.</p>
    </div>`;
}

function installHint() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone || settings.installHintDismissed || !(ios || S.installEvt)) return "";
  return `<section class="banner" style="background:var(--surface);color:var(--text);border-color:var(--border)"><p>${ios ? "Legg UV på hjemskjermen: trykk Del og så «Legg til på Hjem-skjerm»." : "Legg UV på hjemskjermen, så åpner den som en app."}</p>
    ${S.installEvt ? `<button class="btn primary" data-act="install">Installer</button>` : ""}<button class="btn text" data-act="hint-off">Ikke nå</button></section>`;
}

// ---------- sheets ----------
// Phone: a bottom sheet you can drag. It follows the finger 1:1 from where it was grabbed, resists past the top,
// projects the flick on release and keeps the finger's speed, and can be grabbed again while it moves.
// Desktop: a centred dialog that scales in from 96 %. Reduced motion: no travel, it simply appears.
const SH = { y: 1, anim: null, open: false };          // y: 0 = open … 1 = closed (fraction of the sheet's height)
const sheetEl = $("#sheet"), scrimEl = $("#scrim"), wideMQ = matchMedia("(min-width: 900px)");
function paintSheet(y) {
  SH.y = y; const h = sheetEl.offsetHeight || 1;
  if (wideMQ.matches) { sheetEl.style.transform = `translate(-50%,-50%) scale(${0.96 + 0.04 * (1 - y)})`; sheetEl.style.opacity = String(1 - y); }
  else { sheetEl.style.transform = `translate(-50%, ${(y < 0 ? rubberband(y * h, h) : y * h).toFixed(1)}px)`; sheetEl.style.opacity = ""; }
  scrimEl.style.opacity = String(Math.max(0, Math.min(1, 1 - y)));
}
function moveSheet(to, { velocity = 0, damping = 1, response = 0.35, onDone } = {}) {
  const from = SH.anim ? SH.anim.stop().x : SH.y;
  SH.anim = spring({ from, to, velocity, damping, response, precision: 0.001, onUpdate: paintSheet, onDone: () => { SH.anim = null; onDone?.(); } });
}
let lastFocus = null;
function openSheet(title, html, onMount) {
  if (!SH.open) lastFocus = document.activeElement;
  $("#sheet-title").textContent = title; $("#sheet-body").innerHTML = html; $("#sheet-body").scrollTop = 0;
  sheetEl.hidden = false; scrimEl.hidden = false; $(".app").inert = true; SH.open = true;
  if (!SH.anim) paintSheet(SH.open && SH.y < 1 ? SH.y : 1);
  moveSheet(0, { damping: 1, response: 0.35 });   // opened by a tap: no momentum, so no bounce
  sheetEl.focus({ preventScroll: true });
  onMount?.($("#sheet-body"));
}
function closeSheet({ velocity = 0 } = {}) {
  if (!SH.open) return; SH.open = false; $(".app").inert = false;
  moveSheet(1, { velocity, damping: 1, response: 0.3, onDone: () => { if (!SH.open) { sheetEl.hidden = true; scrimEl.hidden = true; } } });
  lastFocus?.focus?.({ preventScroll: true });
}
$("#sheet-close").onclick = () => closeSheet(); scrimEl.onclick = () => closeSheet();
sheetEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSheet();
  if (e.key === "Tab") { const f = [...sheetEl.querySelectorAll("button,input,a[href],[tabindex='0']")].filter((x) => !x.disabled && x.offsetParent); if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { f.at(-1).focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === f.at(-1)) { f[0].focus(); e.preventDefault(); } }
});
{ // drag to dismiss (phone)
  const zone = $("#sheet-drag"); let g = null;
  zone.addEventListener("pointerdown", (e) => {
    if (wideMQ.matches || e.target.closest("button")) return;
    const from = SH.anim ? SH.anim.stop().x : SH.y; SH.anim = null;          // grab it mid-flight, from where it is
    g = { id: e.pointerId, y0: e.clientY, from, h: sheetEl.offsetHeight, live: false, hist: [{ y: e.clientY, t: e.timeStamp }] };
    zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener("pointermove", (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y0;
    if (!g.live && Math.abs(dy) < 10 && g.from === 0) return;                  // 10 px before it commits
    g.live = true; g.hist.push({ y: e.clientY, t: e.timeStamp }); if (g.hist.length > 6) g.hist.shift();
    paintSheet(g.from + dy / g.h);
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const a = g.hist[0], b = g.hist.at(-1), v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;   // px/s
    const landing = SH.y * g.h + project(v);                                 // where the flick is heading
    const vel = v / g.h;                                                     // in sheet-heights per second
    if (g.live && landing > g.h * 0.45) { haptic(); closeSheet({ velocity: vel }); }
    else moveSheet(0, { velocity: vel, damping: g.live && Math.abs(v) > 300 ? 0.8 : 1, response: 0.3 }); // a flick earns a little bounce
    g = null;
  };
  zone.addEventListener("pointerup", end); zone.addEventListener("pointercancel", end);
}

function sheetPlaces() {
  const recent = get("recent");
  openSheet("Velg sted", `
    <label class="field">${icon("i-search")}<input id="q" type="search" placeholder="Søk etter by eller sted" autocomplete="off" aria-label="Søk etter sted"></label>
    <button class="btn secondary" data-act="locate">${icon("i-pin")}Bruk posisjonen min</button>
    <div id="results" aria-live="polite"></div>
    ${recent.length ? `<div><p class="muted" style="margin-bottom:4px">Nylig brukt</p>${recent.map((p, i) => placeRow(p, `r${i}`)).join("")}</div>` : ""}`, (body) => {
    const q = $("#q", body); let t = 0, seq = 0; setTimeout(() => q.focus(), 50);
    body._places = { ...Object.fromEntries(recent.map((p, i) => [`r${i}`, p])) };
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(async () => {
      const my = ++seq, res = $("#results", body);
      if (q.value.trim().length < 2) { res.innerHTML = ""; return; }
      res.innerHTML = `<p class="muted">Søker …</p>`;
      try { const list = await searchPlaces(q.value); if (my !== seq) return;
        list.forEach((p, i) => (body._places[`s${i}`] = p));
        res.innerHTML = list.length ? list.map((p, i) => placeRow(p, `s${i}`)).join("") : `<p class="muted">Fant ikke «${esc(q.value)}».</p>`;
      } catch { if (my === seq) res.innerHTML = `<p class="muted">Søket virker ikke uten nett.</p>`; }
    }, 250); });
  });
}
const placeRow = (p, key) => `<button class="place-row" data-act="pick" data-key="${key}">${icon("i-map")}<span class="grow"><span>${esc(p.name)}</span><small>${esc(p.region)}</small></span></button>`;
function choosePlace(p, current = false) {
  place = { name: p.name, region: p.region, lat: p.lat, lon: p.lon, current }; set("place", place);
  if (!current) { const r = [place, ...get("recent").filter((x) => !(x.name === place.name && Math.abs(x.lat - place.lat) < 0.01))].slice(0, 10); set("recent", r); }
  S.fc = null; S.error = null; render(); load();
}

function sheetSkin() {
  let pick = skin.type;
  openSheet("Hudtype", `<p class="muted">Hudtypen avgjør hvor fort du blir brent og hvor mye vitamin D du lager i sola.</p>
    <div class="skins" role="radiogroup" aria-label="Hudtype">${[1, 2, 3, 4, 5, 6].map((n) => `<button class="skin" role="radio" aria-checked="${n === pick}" data-skin="${n}" style="--c:${SKIN_SW[n]}"><span class="sw" aria-hidden="true"></span><b>${ROMAN[n]}</b><small>${SKIN[n].split(",")[0]}</small></button>`).join("")}</div>
    <button class="btn primary" id="use-skin">Bruk hudtype ${ROMAN[pick]}</button>`, (body) => {
    body.addEventListener("click", (e) => { const b = e.target.closest("[data-skin]"); if (!b) return; pick = +b.dataset.skin;
      body.querySelectorAll("[data-skin]").forEach((x) => x.setAttribute("aria-checked", +x.dataset.skin === pick)); $("#use-skin", body).textContent = `Bruk hudtype ${ROMAN[pick]}`; });
    $("#use-skin", body).onclick = () => { skin = { ...skin, type: pick, chosen: true }; set("skin", skin); closeSheet(); render(); toast(`Hudtype ${ROMAN[pick]} er lagret`); };
  });
}
function sheetVitD() {
  let g = skin.vitaminDGoal;
  openSheet("Vitamin D-mål", `<p class="big-value" id="vd-v"></p><p class="muted" style="text-align:center" id="vd-u"></p>
    <input type="range" id="vd-r" min="400" max="4000" step="100" value="${g}" aria-label="Vitamin D-mål i IE">
    <div class="plan-l"><span>400 IE</span><span>4 000 IE</span></div><button class="btn primary" id="vd-save">Lagre</button>`, (body) => {
    const show = () => { $("#vd-v", body).textContent = `${nb(g)} IE`; $("#vd-u", body).textContent = `${nb(g / 40, 1)} µg per dag`; };
    show(); $("#vd-r", body).oninput = (e) => { g = +e.target.value; show(); };
    $("#vd-save", body).onclick = () => { skin = { ...skin, vitaminDGoal: g }; set("skin", skin); closeSheet(); render(); };
  });
}
function sheetSunscreen() {
  let pick = sunscreen?.spf || recommendedSpf(S.fc ? ctx().day.peak.uv : 3) || 30;
  openSheet("Solkrem", `<p class="muted">Registrer når du smører deg. Beskyttelsen avtar, så vi minner deg på å smøre på igjen etter ${SPF_HOURS} timer.</p>
    <div class="chips" role="radiogroup" aria-label="Solfaktor">${[15, 30, 50].map((n) => `<button class="chip" role="radio" aria-checked="${n === pick}" data-spf="${n}">SPF ${n}</button>`).join("")}</div>
    <button class="btn primary" id="spf-now">Smurt på nå</button>${sunscreen ? `<button class="btn text" id="spf-off">Fjern solkrem for i dag</button>` : ""}`, (body) => {
    body.addEventListener("click", (e) => { const b = e.target.closest("[data-spf]"); if (!b) return; pick = +b.dataset.spf; body.querySelectorAll("[data-spf]").forEach((x) => x.setAttribute("aria-checked", +x.dataset.spf === pick)); });
    $("#spf-now", body).onclick = () => { sunscreen = { spf: pick, at: Date.now() }; set("sunscreen", sunscreen); S.reminded = {}; closeSheet(); render(); toast(`SPF ${pick} registrert`); askNotify(); };
    const off = $("#spf-off", body); if (off) off.onclick = () => { const was = sunscreen; sunscreen = null; set("sunscreen", null); closeSheet(); render(); toast("Solkrem fjernet", { label: "Angre", run: () => { sunscreen = was; set("sunscreen", was); render(); } }); };
  });
}
function timeToMs(hhmm, refMs) { // a local time today at the place → UTC ms
  const [h, m] = hhmm.split(":").map(Number), fc = S.fc, ln = localNow(fc, refMs);
  return refMs + ((h * 60 + m) - ln.min) * 60000;
}
function sheetEditStart() {
  const cur = clock(localNow(S.fc, session.start).min);
  openSheet("Endre start", `<label class="stack" style="gap:8px"><span>Når gikk du ut?</span><input class="field" type="time" id="st" value="${cur}"></label><button class="btn primary" id="st-save">Lagre</button>`, (body) => {
    $("#st-save", body).onclick = () => { const ms = timeToMs($("#st", body).value, Date.now()); if (ms < Date.now()) { session = { ...session, start: ms }; set("session", session); } closeSheet(); render(); };
  });
}
function sheetEditLog(id) {
  const s = log.find((x) => x.id === id); if (!s) return;
  openSheet("Endre økt", `<div class="grid" style="gap:12px"><label class="stack s6" style="gap:8px"><span>Start</span><input class="field" type="time" id="ls" value="${clock(localNow(S.fc, s.start).min)}"></label>
    <label class="stack s6" style="gap:8px"><span>Slutt</span><input class="field" type="time" id="le" value="${clock(localNow(S.fc, s.end).min)}"></label></div>
    <button class="btn primary" id="l-save">Lagre</button><button class="btn text danger-text" id="l-del">Slett økten</button>`, (body) => {
    $("#l-save", body).onclick = () => { const a = timeToMs($("#ls", body).value, s.start), b = timeToMs($("#le", body).value, s.end); if (b > a) Object.assign(s, finishTotals({ ...s, start: a, end: b })); set("log", log); closeSheet(); render(); };
    $("#l-del", body).onclick = () => { const i = log.findIndex((x) => x.id === id), gone = log[i]; log = log.filter((x) => x.id !== id); set("log", log); closeSheet(); render();
      toast("Økten er slettet", { label: "Angre", run: () => { log.splice(i, 0, gone); set("log", log); render(); } }); };
  });
}
function sheetDay(i) {
  const d = S.fc.days[i];
  openSheet(dayName(d.date, i - todayIndex(S.fc)), `<p>${d.window ? `Beskytt deg <span class="nw">${winText(d.window)}</span>. ` : "Lav UV hele dagen. "}Høyest ${fmt1(d.peak.uv)} kl. ${clock(d.peak.min)}.</p><div id="dd"></div><p class="muted">${sunLine(d)}</p>`, (body) => {
    dayChart($("#dd", body), { ...d, now: 0 }, { uvAt: curve(d, S.fc.lat, S.fc.lon), isToday: false, height: 200 });
  });
}

// ---------- tracking ----------
function finishTotals(s) {
  // split the session at local midnights, so a session from 23:30 to 00:30 keeps all its minutes
  const fc = S.fc; let dose = 0, iu = 0, t = s.start;
  while (t < s.end) {
    const ln = localNow(fc, t), dayEnd = t + (1440 - ln.min) * 60000, segEnd = Math.min(s.end, dayEnd);
    const d = fc.days.find((x) => x.date === ln.date);
    if (d) {
      const uvAt = curve(d, fc.lat, fc.lon), sp = sunscreen && localNow(fc, sunscreen.at).date === ln.date ? sunscreen : null;
      const r = sessionTotals({ uvAt, fromMin: Math.floor(ln.min), toMin: Math.floor(ln.min + (segEnd - t) / 60000), skin: skin.type, env: s.env ?? skin.env, spf: sp?.spf || 0, appliedAtMin: sp ? localNow(fc, sp.at).min : null });
      dose += r.dose; iu += r.iu;
    }
    t = segEnd;
  }
  return { start: s.start, end: s.end, minutes: Math.round((s.end - s.start) / 60000), dose, iu: Math.round(iu) };
}
let lastToggle = -Infinity;
const tooSoon = () => { const t = performance.now(); if (t - lastToggle < 800) return true; lastToggle = t; return false; };
function startSession() { if (!S.fc || session || tooSoon()) return; session = { id: crypto.randomUUID?.() || String(Date.now()), start: Date.now(), env: skin.env }; set("session", session); S.reminded = {}; haptic(); render(); toast("Soltid startet"); askNotify(); }
function stopSession() {
  if (!session || tooSoon()) return; const done = { id: session.id, env: session.env, ...finishTotals({ ...session, end: Date.now() }) };
  if (done.minutes >= 1) { log = [...log, done].slice(-200); set("log", log); }
  const was = session; session = null; set("session", null); haptic(); render();
  toast(done.minutes >= 1 ? `Lagret: ${dur(done.minutes)} i sola` : "Økten var under ett minutt", { label: "Angre", run: () => {
    session = was; set("session", session); log = log.filter((x) => x.id !== done.id); set("log", log); render(); } });
}

// ---------- reminders (while the app is open) ----------
S.reminded = {};
async function askNotify() { if (settings.reminders && "Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch {} } }
function remind(key, text) {
  if (S.reminded[key]) return; S.reminded[key] = true;
  $("#banner").innerHTML = `<div class="banner" role="alert"><p>${esc(text)}</p><button class="btn secondary" data-act="banner-ok">OK</button></div>`;
  if (settings.reminders && "Notification" in window && Notification.permission === "granted" && document.hidden) {
    navigator.serviceWorker?.ready.then((r) => r.showNotification("UV", { body: text, icon: "icon-192.png", tag: key })).catch(() => {});
  }
}
function checkReminders() {
  if (!S.fc || !settings.reminders) return; const c = ctx(); if (c.night) return;
  if (c.reapplyAt != null && c.now.min >= c.reapplyAt && c.uv >= 2) remind(`reapply-${sunscreen.at}`, `Tid for mer solkrem. Det er ${SPF_HOURS} timer siden du smurte deg.`);
  if (session && c.over) remind(`over-${session.id}`, "Du har nådd grensen for solbrenthet. Gå i skyggen.");
  else if (session && c.burnIn != null && c.burnIn <= 15) remind(`burn-${session.id}`, `Du kan bli solbrent om ${dur(c.burnIn)}. Finn skygge eller smør deg.`);
}

// ---------- routing and events ----------
const VIEWS = { uv: viewUV, hud: viewHud, prognose: viewPrognose, innstillinger: viewSettings };
function route(focus = true) {
  const h = location.hash.replace(/^#\/?/, "") || "uv"; S.view = VIEWS[h] ? h : "uv";
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("on", v.id === `v-${S.view}`));
  document.querySelectorAll("[data-nav]").forEach((a) => (a.dataset.nav === S.view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  render();
  document.title = { uv: place ? `UV · ${place.name}` : "UV", hud: "Hud og soltid · UV", prognose: "Prognose · UV", innstillinger: "Innstillinger · UV" }[S.view];
  if (focus) $(`#t-${S.view}`)?.focus({ preventScroll: true });
}
function render() { const y = scrollY; VIEWS[S.view](); if (y) scrollTo(0, y); }
addEventListener("hashchange", () => { if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) { const t = document.startViewTransition(() => route()); t.ready.catch(() => {}); t.finished.catch(() => {}); } else route(); scrollTo(0, 0); });

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act],[data-env],[data-theme-set]"); if (!b) return;
  if (b.dataset.env) { skin = { ...skin, env: b.dataset.env }; set("skin", skin); render(); return; }
  if (b.dataset.themeSet) { settings = { ...settings, theme: b.dataset.themeSet }; set("settings", settings); applyTheme(true); render(); return; }
  const a = b.dataset.act;
  if (a === "start") startSession(); else if (a === "stop") stopSession();
  else if (a === "places") sheetPlaces(); else if (a === "skin") sheetSkin(); else if (a === "vitd") sheetVitD(); else if (a === "sunscreen") sheetSunscreen();
  else if (a === "edit-start") sheetEditStart(); else if (a === "edit-log") sheetEditLog(b.dataset.id); else if (a === "day") sheetDay(+b.dataset.i);
  else if (a === "pick") { const p = $("#sheet-body")._places?.[b.dataset.key]; if (p) { closeSheet(); choosePlace(p); } }
  else if (a === "locate") { closeSheet(); useLocation(true); }
  else if (a === "quick") choosePlace(QUICK[+b.dataset.i]);
  else if (a === "retry") load(true);
  else if (a === "reminders") { settings = { ...settings, reminders: !settings.reminders }; set("settings", settings); render(); if (settings.reminders) askNotify(); }
  else if (a === "wipe") { if (confirm("Slette hudtype, logg, steder og innstillinger fra denne enheten?")) { clearAll(); location.hash = "#/"; location.reload(); } }
  else if (a === "hint-off") { settings = { ...settings, installHintDismissed: true }; set("settings", settings); render(); }
  else if (a === "install") { S.installEvt?.prompt(); S.installEvt = null; render(); }
  else if (a === "banner-ok") $("#banner").innerHTML = "";
});
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvt = e; if (S.view === "uv") render(); });

let toastT = 0;
function toast(t, action) {
  const el = $("#toast"); el.innerHTML = ""; el.append(document.createTextNode(t));
  if (action) { const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { el.classList.remove("on", "has-action"); action.run(); }; el.append(b); }
  el.classList.toggle("has-action", !!action); el.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on", "has-action"), action ? 5000 : 2600);
}
function applyTheme(fade = false) {
  const go = () => { if (settings.theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = settings.theme; };
  if (fade && document.startViewTransition && !reducedMotion()) { const t = document.startViewTransition(go); t.ready.catch(() => {}); t.finished.catch(() => {}); } else go();
}

// ---------- data ----------
async function useLocation(explicit = false) {
  S.locating = true;
  try { const pos = await locate(); const n = await placeName(pos.lat, pos.lon); choosePlace({ ...n, lat: pos.lat, lon: pos.lon }, true); }
  catch { S.locating = false; if (!place) { S.error = "location"; S.loading = false; render(); } else if (explicit) toast("Fikk ikke tilgang til posisjonen"); }
}
async function load(force = false) {
  if (!place) return useLocation();
  S.error = null;
  try {
    S.fc = await getForecast(place.lat, place.lon, { force, onCached: (fc) => { if (!S.fc) { S.fc = fc; render(); } } });
    if (S.fc.stale) toast("Uten nett: viser sist lagrede prognose");
  } catch { if (!S.fc) S.error = "data"; }
  S.loading = false; render();
}

addEventListener("storage", (e) => {
  if (!e.key || !e.key.startsWith("uv:") || e.key.startsWith("uv:fc:") || e.key.startsWith("uv:rg:")) return;
  const prevPlace = place && `${place.lat},${place.lon}`;
  skin = get("skin"); settings = get("settings"); place = get("place"); session = get("session"); log = get("log"); sunscreen = get("sunscreen") || null;
  applyTheme(); if (place && `${place.lat},${place.lon}` !== prevPlace) { S.fc = null; load(); } else render();
});
applyTheme(); route(false); load();
setInterval(() => { if (!document.hidden && S.fc && !$(".daychart.scrub")) { if (S.view === "uv" || S.view === "hud") render(); checkReminders(); } }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.fc && Date.now() - S.fc.fetchedAt > 15 * 60000) load(); });
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
