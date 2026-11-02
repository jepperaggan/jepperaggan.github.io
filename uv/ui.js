// UV app v2: the reading (gauge) and the day chart. Plain ES module.
export const BANDS = [
  { id: "low", from: 0, to: 3, nb: "Lav" },
  { id: "moderate", from: 3, to: 6, nb: "Moderat" },
  { id: "high", from: 6, to: 8, nb: "Høy" },
  { id: "veryhigh", from: 8, to: 11, nb: "Svært høy" },
  { id: "extreme", from: 11, to: 14, nb: "Ekstrem" },
];
export const r1 = (v) => Math.round(v * 10) / 10;
export const bandOf = (uv) => BANDS.find((b) => r1(uv) < b.to) || BANDS[4];
export const fmt1 = (v) => r1(v).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const clock = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`; // taste-skill-ignore: a clock
export const dur = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} t ${m} min` : `${m} min`; };
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.appendChild(n); return n; };
const txt = (parent, s, attrs) => { const t = el("text", attrs, parent); t.textContent = s; return t; };

// ---------- the reading: a 270° scale with a fill to the value, one hue ----------
const MAX = 14, A0 = 135, SW = 270;
const ang = (v) => A0 + (Math.min(Math.max(v, 0), MAX) / MAX) * SW;
const pt = (r, a) => [150 + r * Math.cos((a * Math.PI) / 180), 140 + r * Math.sin((a * Math.PI) / 180)];
const arc = (r, a1, a2) => { const [x1, y1] = pt(r, a1), [x2, y2] = pt(r, a2); return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
export function gauge(host) {
  host.classList.add("gauge");
  host.innerHTML = `<svg viewBox="0 0 300 250" aria-hidden="true"></svg><div class="center"><span class="val num"></span><span class="word"></span></div>`;
  const svg = host.querySelector("svg");
  el("path", { class: "track", d: arc(112, A0, A0 + SW) }, svg);
  const fill = el("path", { class: "fill" }, svg);
  for (const b of BANDS.slice(1)) {             // band boundaries: a cut in the track and the value beside it (the scale)
    const [x1, y1] = pt(105, ang(b.from)), [x2, y2] = pt(119, ang(b.from));
    el("line", { class: "tick", x1, y1, x2, y2 }, svg);
    const [lx, ly] = pt(134, ang(b.from));
    txt(svg, String(b.from), { class: "tl", x: lx, y: ly + 4, "text-anchor": "middle" });
  }
  const [zx, zy] = pt(134, ang(0)); txt(svg, "0", { class: "tl", x: zx, y: zy + 4, "text-anchor": "middle" });
  let shown = 0, raf = 0;
  const draw = (v) => { fill.setAttribute("d", v > 0.05 ? arc(112, A0, ang(v)) : ""); host.querySelector(".val").textContent = fmt1(v); };
  return {
    set(v, { instant = false } = {}) {
      const b = bandOf(v);
      document.documentElement.dataset.band = b.id;
      host.querySelector(".word").textContent = b.nb;
      host.setAttribute("role", "img"); host.setAttribute("aria-label", `UV-indeks ${fmt1(v)}, ${b.nb.toLowerCase()}`);
      cancelAnimationFrame(raf);
      if (instant || matchMedia("(prefers-reduced-motion: reduce)").matches) { shown = v; draw(v); return; }
      let vel = 0, last = performance.now();
      const step = (t) => { const dt = Math.min(0.032, (t - last) / 1000); last = t; vel += (160 * (v - shown) - 24 * vel) * dt; shown += vel * dt;
        if (Math.abs(v - shown) < 0.004 && Math.abs(vel) < 0.01) shown = v; draw(Math.max(0, shown)); if (shown !== v) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    },
  };
}

// ---------- the day chart: UV through today; past solid in the band hue, forecast dashed grey ----------
// day = { samples:[{min,uv}], rise, set, peak:{min,uv}, window:{from,to}|null, now }
export function dayChart(host, day, { height = 200, onScrub, onRelease, uvAt: uvFn, isToday = true } = {}) {
  host.classList.add("daychart");
  host.tabIndex = 0; host.setAttribute("role", "slider"); host.setAttribute("aria-label", "UV gjennom dagen");
  const tip = document.createElement("span"); tip.className = "tip num";
  let cur = 0, W = 0, back = 0;
  const L = 28, R = 8, T = 22, B = 24;                          // y lane, right pad, label row, x labels
  const x0 = Math.min(6 * 60, Math.floor(((day.rise ?? 360) - 30) / 120) * 120), x1 = Math.max(21 * 60, Math.ceil(((day.set ?? 1260) + 30) / 120) * 120);                              // 06:00–21:00 on every day, so days compare
  const yMax = Math.max(4, Math.ceil((day.peak.uv + 0.5) / 2) * 2);
  const ticks = []; for (let v = 0; v <= yMax; v += yMax <= 6 ? 2 : yMax <= 10 ? 2 : 4) ticks.push(v);
  const uvAt = uvFn;
  if (!isToday) { day = { ...day, now: x0 }; host.classList.add("forecast"); }
  const samples = []; for (let m = 5 * 60; m <= 22 * 60; m += 5) samples.push({ min: m, uv: uvAt(m) });
  cur = day.now;
  function render() {
    W = host.clientWidth; if (!W) return;
    const H = height, pw = W - L - R, ph = H - T - B;
    const X = (m) => L + ((m - x0) / (x1 - x0)) * pw, Y = (v) => T + ph - (v / yMax) * ph;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, height: H, "aria-hidden": "true" });
    for (const t of ticks) { if (t) el("line", { class: "grid-l", x1: L, x2: W - R, y1: Y(t), y2: Y(t) }, svg); txt(svg, String(t), { class: "yt", x: L - 8, y: Y(t) + 4, "text-anchor": "end" }); }
    if (day.window) {
      el("rect", { class: "span", x: X(day.window.from), y: T, width: X(day.window.to) - X(day.window.from), height: ph }, svg);
      txt(svg, `Beskyttelse ${clock(day.window.from)}–${clock(day.window.to)}`, { class: "span-l", x: (X(day.window.from) + X(day.window.to)) / 2, y: T - 8, "text-anchor": "middle" });
    }
    el("line", { class: "ref", x1: L, x2: W - R, y1: Y(3), y2: Y(3) }, svg);
    txt(svg, "UV 3", { class: "ref-l", x: W - R, y: Y(3) - 6, "text-anchor": "end" });
    el("line", { class: "base", x1: L, x2: W - R, y1: T + ph, y2: T + ph }, svg);
    for (let h = x0 / 60; h <= x1 / 60 - 1; h += 2) txt(svg, String(h % 24).padStart(2, "0"), { class: "xt", x: X(h * 60), y: H - 6, "text-anchor": "middle" }); // taste-skill-ignore: clock hours
    const pts = samples.filter((s) => s.min >= x0 && s.min <= x1);
    const path = (arr) => arr.map((s, i) => `${i ? "L" : "M"}${X(s.min).toFixed(1)} ${Y(s.uv).toFixed(1)}`).join("");
    const past = pts.filter((s) => s.min <= day.now), fut = pts.filter((s) => s.min >= day.now);
    const nowPt = { min: day.now, uv: uvAt(day.now) };
    el("path", { class: "future", d: path([nowPt, ...fut]) }, svg);
    el("path", { class: "past", d: path([...past, nowPt]) }, svg);
    const nowLine = el("line", { class: "now", y1: T, y2: T + ph }, svg);
    const handle = el("circle", { class: "handle", r: 6 }, svg);
    el("rect", { class: "hit", x: L, y: 0, width: pw, height: H }, svg);
    host.replaceChildren(svg, tip);
    const place = (m) => {
      cur = Math.min(x1, Math.max(x0, m)); const uv = Math.max(0, uvAt(cur)), x = X(cur), y = Y(uv);
      nowLine.setAttribute("x1", x); nowLine.setAttribute("x2", x); handle.setAttribute("cx", x); handle.setAttribute("cy", y);
      tip.style.left = `${Math.min(W - 60, Math.max(60, x))}px`; tip.style.top = `${Math.max(0, y - 36)}px`;
      tip.textContent = `${clock(cur)} · UV ${fmt1(uv)}`;
      host.setAttribute("aria-valuetext", `${clock(cur)}, UV ${fmt1(uv)}`);
      onScrub?.(uv, cur);
    };
    const toMin = (cx) => x0 + ((cx - host.getBoundingClientRect().left - L) / pw) * (x1 - x0);
    let drag = false;
    svg.addEventListener("pointerdown", (e) => { drag = true; svg.setPointerCapture(e.pointerId); host.classList.add("scrub"); clearTimeout(back); place(toMin(e.clientX)); });
    svg.addEventListener("pointermove", (e) => { if (drag) place(toMin(e.clientX)); });
    const up = () => { if (!drag) return; drag = false; back = setTimeout(() => { host.classList.remove("scrub"); place(day.now); onRelease?.(); }, 1500); };
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
    host.api = { place };
    place(cur);
  }
  host.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -15, ArrowRight: 15 }[e.key];
    if (step) { host.classList.add("scrub"); host.api.place(cur + step); e.preventDefault(); }
    if (e.key === "Escape") { host.classList.remove("scrub"); host.api.place(day.now); onRelease?.(); }
  });
  const ro = new ResizeObserver(() => { if (host.clientWidth !== W) render(); }); ro.observe(host);
  document.fonts?.ready.then(render);
  render();
  return { uvAt, destroy: () => ro.disconnect() };
}
