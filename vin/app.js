// Vinprofil — raggan.no/vin
(() => {
"use strict";

/* ================= Utils ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt1 = n => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
const kr = n => Math.round(n).toLocaleString("nb-NO") + " kr";
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const YEAR = new Date().getFullYear();
const numOrNull = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const RM = matchMedia("(prefers-reduced-motion: reduce)");
document.addEventListener("touchstart", () => {}, { passive: true }); // :active på iOS

const TYPES = ["rød", "hvit", "rosé", "musserende", "oransje", "søt"];
const TYPE_LABEL = { "rød": "Rød", "hvit": "Hvit", "rosé": "Rosé", "musserende": "Musser.", "oransje": "Oransje", "søt": "Søt" };
const GLASS = {
  "rød": "radial-gradient(circle at 35% 30%, #A03A55 0%, #6A1A2E 55%, #3E0C1A 100%)",
  "hvit": "radial-gradient(circle at 35% 30%, #F6EBB8 0%, #E2CC7C 60%, #C9AE55 100%)",
  "rosé": "radial-gradient(circle at 35% 30%, #FBD3CC 0%, #EFA59B 60%, #D9837A 100%)",
  "musserende": "radial-gradient(circle at 35% 30%, #FBF4D6 0%, #EADFB0 60%, #D4C48A 100%)",
  "oransje": "radial-gradient(circle at 35% 30%, #F2B98A 0%, #D9894A 60%, #B5672C 100%)",
  "søt": "radial-gradient(circle at 35% 30%, #E8B86A 0%, #C4862E 60%, #8F5A17 100%)",
  "": "radial-gradient(circle at 35% 30%, #E6E4E8 0%, #CFCCD2 60%, #B6B2BA 100%)",
};
const glass = t => GLASS[TYPES.includes(t) ? t : ""];
const WORDS = { 1: "Udrikkelig", 2: "Dårlig", 3: "Svak", 4: "Middels", 5: "Helt ok", 6: "God", 7: "Veldig god", 8: "Fremragende", 9: "Enestående", 10: "Uforglemmelig" };
const WHERE = [["restaurant", "Restaurant"], ["butikk", "Kjøpt"], ["hjemme", "Hjemme"], ["hos-noen", "Hos noen"]];
const DIMS = [["fylde", "Fylde", ["lett", "lett", "middels", "fyldig", "fyldig"]], ["syre", "Syre", ["myk", "myk", "middels", "frisk", "frisk"]], ["tannin", "Tannin", ["glatt", "myk", "middels", "fast", "stram"]], ["sodme", "Sødme", ["tørr", "tørr", "halvtørr", "søtlig", "søt"]], ["frukt", "Frukt", ["dempet", "lite", "middels", "fruktig", "fruktig"]], ["eik", "Eik", ["ingen", "lite", "middels", "mye", "mye"]]];
const CFG = window.VIN_CONFIG || {};
const CONFIGURED = !!(CFG.supabaseUrl && CFG.supabaseKey && !/DITT-PROSJEKT/.test(CFG.supabaseUrl) && !/LIM-INN/.test(CFG.supabaseKey));

const state = { wines: [], cellar: [], tab: "logg", user: null, lastLoad: 0, radMode: "menu" };
let sb = null, uid = null;

/* ================= Springs (interruptible, velocity-aware) ================= */
class Spring {
  constructor(value, onUpdate) { this.value = value; this.v = 0; this.target = value; this.onUpdate = onUpdate; this.raf = 0; this.tick = this.tick.bind(this); }
  set(x) { this.stop(); this.value = x; this.target = x; this.v = 0; this.onUpdate(x); }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  to(target, { velocity, damping = 1, response = 0.4, done } = {}) {
    if (velocity !== undefined) this.v = velocity;
    this.target = target; this.done = done || null;
    if (RM.matches) { this.set(target); const d = this.done; this.done = null; d && d(); return; }
    this.k = Math.pow(2 * Math.PI / response, 2); this.c = 4 * Math.PI * damping / response;
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
  }
  tick(t) {
    const dt = Math.min(0.064, Math.max(0, (t - this.last) / 1000)); this.last = t;
    const steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
    for (let i = 0; i < steps; i++) { const a = -this.k * (this.value - this.target) - this.c * this.v; this.v += a * h; this.value += this.v * h; }
    if (Math.abs(this.v) < 2 && Math.abs(this.value - this.target) < 0.4) {
      this.value = this.target; this.v = 0; this.onUpdate(this.value); this.raf = 0;
      const d = this.done; this.done = null; d && d(); return;
    }
    this.onUpdate(this.value); this.raf = requestAnimationFrame(this.tick);
  }
}
function tracker() {
  const h = [];
  return {
    add(x, t) { h.push([x, t]); while (h.length > 2 && t - h[0][1] > 100) h.shift(); },
    v() { if (h.length < 2) return 0; const [x0, t0] = h[0], [x1, t1] = h[h.length - 1]; return t1 > t0 ? (x1 - x0) / (t1 - t0) * 1000 : 0; },
  };
}
const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
const rubber = (o, dim, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));

/* ================= Toast ================= */
let toastT;
function toast(msg, action) {
  const t = $("#toast"), b = $("#toastBtn");
  $("#toastMsg").textContent = msg;
  b.hidden = !action;
  if (action) { b.textContent = action.label; b.onclick = () => { t.classList.remove("show"); action.fn(); }; }
  t.classList.add("show"); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), action ? 5000 : 2400);
}

/* ================= Tabs + compact top bar ================= */
const TITLES = { logg: "Logg", profil: "Din smaksprofil", rad: "Sommelier", kjeller: "Vinkjeller" };
function setTab(name) {
  state.tab = name;
  $$(".tabbar .tab[data-tab]").forEach(b => b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
  Object.keys(TITLES).forEach(t => { $("#tab-" + t).hidden = t !== name; });
  $("#topbarTitle").textContent = TITLES[name];
  closeOpenSwipe();
  if (name === "profil") renderProfile();
  if (name === "rad") requestAnimationFrame(() => { placeThumb($("#radSeg")); placeThumb($("#buyWhere")); });
  window.scrollTo(0, 0);
  observeTitle();
}
$$(".tabbar .tab[data-tab]").forEach(b => b.addEventListener("click", () => {
  if (state.tab === b.dataset.tab) window.scrollTo({ top: 0, behavior: RM.matches ? "auto" : "smooth" }); else setTab(b.dataset.tab);
}));
$("#plusBtn").addEventListener("click", () => newWine());
$("#avatarBtn").addEventListener("click", () => setTab("profil"));
let titleObs;
function observeTitle() {
  titleObs?.disconnect();
  const h1 = $("#tab-" + state.tab + " .title");
  $("#topbar").classList.remove("show");
  if (!h1 || !("IntersectionObserver" in window)) return;
  titleObs = new IntersectionObserver(([e]) => $("#topbar").classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
  titleObs.observe(h1);
}

/* ================= Segmented controls (sliding thumb) ================= */
function placeThumb(seg) {
  if (!seg) return;
  const on = seg.querySelector('[aria-selected="true"],[aria-checked="true"]'), th = seg.querySelector(".thumb");
  if (!on || !th || !on.offsetWidth) return;
  th.style.width = on.offsetWidth + "px";
  th.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}
function segPick(seg, btn) {
  const attr = btn.hasAttribute("aria-selected") ? "aria-selected" : "aria-checked";
  $$("button", seg).forEach(b => b.setAttribute(attr, String(b === btn)));
  placeThumb(seg);
}
const segVal = seg => seg?.querySelector('[aria-checked="true"],[aria-selected="true"]')?.dataset.v;
document.addEventListener("click", e => {
  const b = e.target.closest(".seg button"); if (!b) return;
  const seg = b.parentElement; segPick(seg, b);
  if (seg.id === "radSeg") setRadMode(b.dataset.mode);
});
addEventListener("resize", () => $$(".seg").forEach(placeThumb));

/* ================= Sheet ================= */
const sheet = $("#sheet"), scrim = $("#scrim"), sheetBody = $("#sheetBody");
let sheetH = 0, sheetCfg = null, sheetOpen = false;
const sheetSp = new Spring(0, y => {
  sheet.style.transform = `translate3d(0,${y}px,0)`;
  scrim.style.opacity = sheetH ? Math.max(0, Math.min(1, 1 - y / sheetH)) : 0;
});
function openSheet(o) {
  const wasOpen = sheetOpen;
  if (wasOpen && sheetCfg?.onClose) sheetCfg.onClose();
  sheetCfg = o; sheetOpen = true;
  $("#sheetTitle").textContent = o.title || "";
  const L = $("#sheetLeft"), R = $("#sheetRight");
  L.textContent = o.left || ""; L.style.visibility = o.left ? "" : "hidden";
  R.textContent = o.right || ""; R.hidden = !o.right; R.disabled = !!o.rightDisabled;
  R.classList.toggle("plain", !!o.rightPlain);
  sheetBody.innerHTML = `<div class="sheet-inner">${o.html}</div>`;
  const inner = sheetBody.firstElementChild;
  sheet.hidden = false; scrim.hidden = false;
  sheetBody.scrollTop = 0;
  sheetH = sheet.offsetHeight;
  if (!wasOpen) sheetSp.set(sheetH);
  sheetSp.to(0, { damping: 1, response: 0.42 });
  document.documentElement.classList.add("locked");
  o.mount && o.mount(inner);
  requestAnimationFrame(() => $$(".seg", inner).forEach(placeThumb));
  if (!wasOpen) sheet.focus({ preventScroll: true });
}
function closeSheet(velocity = 0) {
  if (!sheetOpen) return;
  sheetOpen = false;
  const cfg = sheetCfg; sheetCfg = null; cfg?.onClose?.();
  document.documentElement.classList.remove("locked");
  sheetSp.to(sheetH, { velocity, damping: 1, response: 0.36, done: () => { if (!sheetOpen) { sheet.hidden = true; scrim.hidden = true; sheetBody.innerHTML = ""; } } });
}
$("#sheetLeft").addEventListener("click", () => closeSheet());
$("#sheetRight").addEventListener("click", () => sheetCfg?.onRight ? sheetCfg.onRight() : closeSheet());
scrim.addEventListener("click", () => closeSheet());
document.addEventListener("keydown", e => { if (e.key === "Escape" && sheetOpen) closeSheet(); });
$("#sheetTop").addEventListener("pointerdown", e => {
  if (e.target.closest("button") || !sheetOpen) return;
  const startY = e.clientY, base = sheetSp.value, id = e.pointerId, tr = tracker();
  sheetSp.stop(); $("#sheetTop").setPointerCapture(id); tr.add(base, e.timeStamp);
  const move = ev => {
    if (ev.pointerId !== id) return;
    let y = base + (ev.clientY - startY);
    if (y < 0) y = rubber(y, sheetH);
    sheetSp.set(y); tr.add(y, ev.timeStamp);
  };
  const up = ev => {
    if (ev.pointerId !== id) return;
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    const v = tr.v(), projected = sheetSp.value + project(v);
    if (projected > sheetH * 0.45 && v > -200) closeSheet(v);
    else sheetSp.to(0, { velocity: v, damping: Math.abs(v) > 300 ? 0.8 : 1, response: 0.3 });
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
});
addEventListener("resize", () => { if (sheetOpen) sheetH = sheet.offsetHeight; });

/* ================= Swipe actions on rows ================= */
let openSwipe = null;
function swipeSp(wrap) {
  if (!wrap._sp) { const row = $(".row", wrap); wrap._sp = new Spring(0, x => { row.style.transform = x ? `translate3d(${x}px,0,0)` : ""; wrap.classList.toggle("swiping", x !== 0); }); }
  return wrap._sp;
}
function closeOpenSwipe(except) {
  if (openSwipe && openSwipe !== except && openSwipe.isConnected) swipeSp(openSwipe).to(0, { response: 0.35 });
  if (openSwipe !== except) openSwipe = null;
}
document.addEventListener("pointerdown", e => {
  const row = e.target.closest(".swipe > .row");
  if (!row) { if (!e.target.closest(".swipe .actions")) closeOpenSwipe(); return; }
  const wrap = row.parentElement, sp = swipeSp(wrap);
  const actW = $(".actions", wrap).offsetWidth, W = wrap.offsetWidth;
  const dismissing = openSwipe && openSwipe !== wrap;
  closeOpenSwipe(wrap);
  const sx = e.clientX, sy = e.clientY, base = sp.value, id = e.pointerId, tr = tracker();
  let mode = null;
  row.classList.add("pressed");
  const cleanup = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); row.classList.remove("pressed"); };
  const move = ev => {
    if (ev.pointerId !== id) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!mode) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { mode = "h"; row.classList.remove("pressed"); try { row.setPointerCapture(id); } catch {} sp.stop(); tr.add(sp.value, ev.timeStamp); }
      else if (Math.abs(dy) > 10) { mode = "v"; cleanup(); return; }
      else return;
    }
    let x = base + dx;
    if (x > 0) x = rubber(x, W);
    sp.set(x); tr.add(x, ev.timeStamp);
  };
  const up = ev => {
    if (ev.pointerId !== id) return;
    cleanup();
    if (mode === "h") {
      const v = tr.v(), proj = sp.value + project(v, 0.99);
      if (proj < -W * 0.62) { openSwipe = null; const last = $$(".actions button", wrap).pop(); sp.to(-W, { velocity: v, response: 0.28, done: () => last?.click() }); }
      else if (proj < -actW / 2) { openSwipe = wrap; sp.to(-actW, { velocity: v, damping: Math.abs(v) > 400 ? 0.8 : 1, response: 0.35 }); }
      else { if (openSwipe === wrap) openSwipe = null; sp.to(0, { velocity: v, response: 0.35 }); }
    } else if (!mode && ev.type === "pointerup" && !dismissing) {
      if (sp.value < -1) { openSwipe = null; sp.to(0, { response: 0.35 }); return; }
      openDetail(wrap.dataset.kind, wrap.dataset.id);
    }
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".swipe > .row")) { e.preventDefault(); const w = e.target.parentElement; openDetail(w.dataset.kind, w.dataset.id); }
});
document.addEventListener("click", e => {
  const b = e.target.closest(".swipe .actions button"); if (!b) return;
  const wrap = b.closest(".swipe"), id = wrap.dataset.id, kind = wrap.dataset.kind;
  if (b.dataset.act === "del") collapseRow(wrap, () => removeWithUndo(kind, id));
  else if (b.dataset.act === "drink") { swipeSp(wrap).to(0, { response: 0.35 }); openSwipe = null; const bt = state.cellar.find(x => x.id === id); if (bt) drinkOne(bt); }
});
function collapseRow(wrap, then) {
  if (RM.matches) { then(); return; }
  wrap.style.height = wrap.offsetHeight + "px"; wrap.offsetHeight; wrap.classList.add("collapsing");
  wrap.style.height = "0px"; wrap.style.opacity = "0";
  setTimeout(then, 240);
}

/* ================= Store: Supabase + local queue (no data loss offline) ================= */
// Every change is applied locally at once, written to a queue in localStorage,
// and sent to the database in order. Nothing leaves the queue until the database confirms it.
const K = n => `vin-${n}:${uid}`;
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
let outbox = [];
const arrOf = t => t === "wines" ? state.wines : state.cellar;
const stripId = d => { const { id, ...rest } = d; return rest; };
const rowToItem = r => ({ ...(r.data || {}), id: r.id });
const pendingIds = () => new Set(outbox.map(o => o.rowId));
function saveCache() { if (uid) ls.set(K("cache"), { wines: state.wines, cellar: state.cellar }); }
function applyOp(op) {
  const arr = arrOf(op.table), i = arr.findIndex(x => x.id === op.rowId);
  if (op.op === "upsert") { const item = { ...op.data, id: op.rowId }; if (i >= 0) arr[i] = item; else arr.push(item); }
  else if (i >= 0) arr.splice(i, 1);
}
function rerender(table) { table === "wines" ? onWines() : onCellar(); }
function mutate(table, op, rowId, data) {
  outbox = outbox.filter(o => !(o.table === table && o.rowId === rowId && o !== inFlight));
  const entry = { table, op, rowId, data: data ? stripId(data) : null, ts: Date.now() };
  outbox.push(entry);
  ls.set(K("outbox"), outbox);
  applyOp(entry); saveCache(); rerender(table);
  flush();
}
let flushing = false, inFlight = null;
// Bare feil i selve dataene forkastes. Nett-, innloggings- og tilgangsfeil blir liggende i køen.
const permanent = err => !!(err && err.code && /^(22|23)/.test(String(err.code)));
async function flush() {
  if (flushing || !sb || !uid) { updateSync(); return; }
  if (!navigator.onLine) { updateSync(); return; }
  flushing = true;
  try {
    const { data: { session } } = await sb.auth.getSession().catch(() => ({ data: {} }));
    if (!session) return;
    while (outbox.length) {
      const op = outbox[0]; inFlight = op;
      let error;
      try {
        ({ error } = op.op === "upsert"
          ? await sb.from(op.table).upsert({ id: op.rowId, data: op.data })
          : await sb.from(op.table).delete().eq("id", op.rowId));
      } catch (e) { error = { message: String(e) }; }
      inFlight = null;
      if (error && !permanent(error)) break;          // nett eller innlogging: prøv igjen senere
      if (error) { console.warn("Forkastet endring", error); toast("En endring ble avvist av databasen."); }
      outbox = outbox.filter(o => o !== op);
      ls.set(K("outbox"), outbox);
    }
  } finally { flushing = false; inFlight = null; updateSync(); }
}
setInterval(() => { if (outbox.length) flush(); }, 20000);
function updateSync() {
  const n = outbox.length;
  $("#offlineBanner").hidden = navigator.onLine;
  renderLogEyebrow(n);
}
async function loadAll({ quiet = false } = {}) {
  if (!sb || !uid) return;
  try {
    const [w, c] = await Promise.all([sb.from("wines").select("id,data"), sb.from("cellar").select("id,data")]);
    if (w.error) throw w.error; if (c.error) throw c.error;
    state.wines = w.data.map(rowToItem); state.cellar = c.data.map(rowToItem);
    for (const op of outbox) applyOp(op);   // det som ennå ikke er sendt, vinner
    state.lastLoad = Date.now();
    saveCache(); onWines(); onCellar();
    runEnrich();
  } catch (e) { if (!quiet && navigator.onLine) toast("Fikk ikke hentet fra databasen. Viser det som er lagret på telefonen."); }
}
function removeWithUndo(kind, id) {
  const table = kind === "wine" ? "wines" : "cellar";
  const item = arrOf(table).find(x => x.id === id); if (!item) return;
  mutate(table, "delete", id);
  toast(kind === "wine" ? `${item.name} er slettet` : `${item.name} er fjernet`, { label: "Angre", fn: () => mutate(table, "upsert", id, item) });
}
function onWines() { renderLog(); if (state.tab === "profil") renderProfile(); refreshOpenDetail(); }
function onCellar() { renderCellar(); refreshOpenDetail(); }
addEventListener("online", () => { updateSync(); flush().then(() => loadAll({ quiet: true })); });
addEventListener("offline", updateSync);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && uid) { flush(); if (Date.now() - state.lastLoad > 30000) loadAll({ quiet: true }); }
});

/* ================= AI (via Supabase function; key stays on the server) ================= */
async function fileToImage(file, max = 1568) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej({ code: "image_rejected" }); img.src = URL.createObjectURL(file); }); }
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement("canvas"); c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return { media_type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
}
async function ask(prompt, { images = [], tier = "default", kind = "", signal, max_tokens, search = false, json = false } = {}) {
  if (!navigator.onLine) throw { code: "offline" };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw { code: "not_signed_in" };
  const imgs = [];
  for (const f of images) imgs.push(await fileToImage(f));
  if (signal?.aborted) throw { code: "cancelled" };
  let r;
  try {
    r = await fetch(`${CFG.supabaseUrl}/functions/v1/ai`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ prompt, images: imgs, tier, kind, max_tokens, search, json }),
    });
  } catch (e) { throw { code: e?.name === "AbortError" ? "cancelled" : "offline" }; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Feil fra selve funksjonen har j.error. Feil fra Supabase foran funksjonen (f.eks. «Verify JWT») har bare message.
    const code = j.error || (r.status === 404 ? "no_function" : r.status === 401 ? "jwt_rejected" : r.status >= 500 && r.status !== 502 ? "function_crashed" : "upstream_error");
    throw { code, status: r.status, detail: j.detail || j.message || j.msg || null };
  }
  return j.text || "";
}
function parseLoose(t) {
  try { return JSON.parse(t); } catch {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch {} }
  const s = t.search(/[[{]/), e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
  throw { code: "invalid_json" };
}
const askJSON = async (p, o = {}) => parseLoose(await ask(p + "\n\nSvar med kun JSON, uten annen tekst og uten kodeblokk.", { ...o, json: true }));
function aiErrText(e) {
  return ({
    offline: "Ingen nettforbindelse. Prøv igjen når du har nett.",
    not_signed_in: "Du er logget ut. Logg inn på nytt.",
    daily_limit: "Dagens kvote for AI er brukt opp. Prøv igjen i morgen.",
    rate_limited: "Gratiskvoten hos AI-tjenesten er brukt opp for nå (per minutt eller per døgn). Prøv igjen senere.",
    image_rejected: "Bildet kunne ikke brukes. Prøv et annet bilde.",
    missing_api_key: "AI er ikke koblet til ennå. Nøkkelen mangler i Supabase.",
    bad_api_key: "AI-nøkkelen er feil eller utløpt.",
    no_function: "AI-funksjonen finnes ikke ennå i Supabase.",
    invalid_json: "Svaret kom i feil format. Prøv igjen.",
    refused: "AI-en ville ikke svare på dette. Prøv å formulere deg annerledes.",
    jwt_rejected: "Supabase avviste innloggingen før AI-funksjonen. Slå av «Verify JWT» på funksjonen ai.",
    function_crashed: "AI-funksjonen krasjet i Supabase. Se Logs på funksjonen ai.",
    upstream_error: "AI-tjenesten svarte med en feil.",
  })[e && e.code] || "Noe gikk galt. Prøv igjen.";
}

/* ---- Enrichment: shared profile cache → Vinmonopolet → style reference → AI ---- */
// 1. Har noen (du eller Mollie) allerede logget samme vin, gjenbrukes profilen fra det delte lageret.
// 2. Ellers: Vinmonopolets smaksklokker (målt av smakspanel) + nærmeste stil fra stilreferansen som utgangspunkt,
//    og AI fyller inn resten. Resultatet lagres i det delte lageret.
// 3. Stikkord fra notatet er personlige og lagres bare på vinen din.
const STYLES = window.VIN_STYLES || [];
const STYLE_BY_ID = Object.fromEntries(STYLES.map(s => [s.id, s]));
const DIM_KEYS = DIMS.map(d => d[0]);
const normTxt = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9æøå]+/g, " ").trim();
const STYLE_INDEX = STYLES.flatMap(s => s.a.map(a => ({ s, a: normTxt(a) }))).filter(x => x.a);
function matchStyle(w) {
  const hay = " " + normTxt([w.name, w.producer, w.region, w.grape].filter(Boolean).join(" ")) + " ";
  let best = null, bs = -Infinity;
  for (const { s, a } of STYLE_INDEX) {
    if (w.type && s.t !== w.type) continue;
    if (!hay.includes(" " + a + " ")) continue;
    const sc = a.length - (s.g ? 100 : 0);
    if (sc > bs) { bs = sc; best = s; }
  }
  return best;
}
const styleDims = s => s ? Object.fromEntries(DIM_KEYS.map((k, i) => [k, s.d[i]])) : {};
const profileKey = w => `${normTxt(w.name)}|${w.vintage || ""}`;
const clock5 = v => Math.max(1, Math.min(5, Math.round(1 + (v - 1) * 4 / 11)));
const CLOCK_MAP = { fylde: "fylde", friskhet: "syre", garvestoffer: "tannin", sodme: "sodme" };
const vmpType = c => { c = String(c || "").toLowerCase(); return c.includes("rød") ? "rød" : c.includes("hvit") ? "hvit" : (c.includes("rosé") || c.includes("rose")) ? "rosé" : c.includes("musser") ? "musserende" : (c.includes("sterk") || c.includes("søt")) ? "søt" : (c.includes("orange") || c.includes("oransje")) ? "oransje" : null; };
const TRANSIENT_AI = ["offline", "not_signed_in", "rate_limited", "daily_limit", "cancelled"];

async function vmpLookup(w) {
  try {
    if (!navigator.onLine) return null;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const r = await fetch(`${CFG.supabaseUrl}/functions/v1/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "vmp", name: w.name, producer: w.producer || "", vintage: w.vintage || null }),
    });
    if (!r.ok) return null;
    return (await r.json()).match || null;
  } catch { return null; }
}
async function cachedProfile(key) {
  try { const { data, error } = await sb.from("wine_profiles").select("data").eq("key", key).maybeSingle(); return error ? null : data?.data || null; } catch { return null; }
}
function saveProfile(key, p) { sb.from("wine_profiles").upsert({ key, data: p, source: p.source }).then(() => {}, () => {}); }

function enrichPrompt(w, pre, vmp) {
  const known = [["Navn", w.name], ["Produsent", w.producer], ["Årgang", w.vintage], ["Type", w.type], ["Drue", w.grape], ["Region", w.region]]
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  const facts = vmp ? `Fakta fra Vinmonopolet om ${vmp.name || "vinen"}${vmp.year ? ", " + vmp.year : ""}${vmp.district ? ", " + vmp.district : ""}${vmp.country ? ", " + vmp.country : ""}.`
    + (vmp.clocks ? ` Smakspanelets klokker på skala 1–12: ${Object.entries(vmp.clocks).map(([k, v]) => `${k} ${v}`).join(", ")}.` : "")
    + (vmp.taste ? ` Smak: ${vmp.taste}` : "") : "";
  const style = pre
    ? `Sannsynlig stil: ${pre.n} (id ${pre.id}). Typisk profil for stilen (1–5): ${DIMS.map(([, l], i) => `${l.toLowerCase()} ${pre.d[i]}`).join(", ")}. Bruk dette som utgangspunkt og avvik bare der du vet noe konkret om akkurat denne vinen.`
    : `Velg stilen som passer best fra denne listen (id): ${STYLES.map(s => s.id).join(", ")}.`;
  return `Du er sommelier. En person har logget denne vinen:
${known}
Karakter: ${w.rating ?? "ukjent"} av 10
Personens notat: ${w.note ? `"${w.note.slice(0, 1200)}"` : "(ingen)"}

${facts}
${style}

Oppgave 1: Identifiser vinen og gi den typiske smaksprofilen på skala 1–5.${vmp?.clocks ? " Fylde, syre, tannin og sødme skal følge Vinmonopolets klokker omregnet til 1–5." : ""} Er du usikker på den nøyaktige vinen, hold deg til stilen og sett confidence lavere.
Oppgave 2: Hent ut fra notatet hva personen likte og mislikte, som korte stikkord på norsk (1 til 3 ord, små bokstaver). Bare det som faktisk står i notatet. Tomme lister hvis notatet ikke sier noe.

JSON-format:
{"style": "id fra stillisten"|null, "producer": string|null, "vintage": number|null, "type": "rød"|"hvit"|"rosé"|"musserende"|"oransje"|"søt", "grape": string|null, "region": "Region, Land" på norsk|null,
 "dims": {"fylde": 1-5, "syre": 1-5, "tannin": 1-5, "sodme": 1-5, "frukt": 1-5, "eik": 1-5},
 "profile": "én kort setning om stilen, uten tankestrek", "confidence": "høy"|"middels"|"lav",
 "likes": [string], "dislikes": [string]}`;
}
const tagsPrompt = note => `Hent ut fra dette vinnotatet hva personen likte og mislikte, som korte stikkord på norsk (1 til 3 ord, små bokstaver). Bare det som faktisk står i notatet.
Notat: "${note.slice(0, 1200)}"
JSON-format: {"likes": [string], "dislikes": [string]}`;

function buildProfile(w, r, pre, vmp) {
  r = r && typeof r === "object" ? r : {};
  const style = STYLE_BY_ID[r.style] || pre || matchStyle({ ...w, region: w.region || r.region, grape: w.grape || r.grape, type: w.type || r.type || vmpType(vmp?.category) });
  const dims = styleDims(style);
  let fromAi = false;
  for (const k of DIM_KEYS) { const v = Math.round(+r.dims?.[k]); if (v >= 1 && v <= 5) { dims[k] = v; fromAi = true; } }
  if (vmp?.clocks) for (const [ck, dk] of Object.entries(CLOCK_MAP)) if (vmp.clocks[ck]) dims[dk] = clock5(vmp.clocks[ck]);
  const confidence = ["høy", "middels", "lav"].includes(r.confidence) ? r.confidence : fromAi ? "middels" : "lav";
  const source = vmp?.clocks ? "vinmonopolet" : (fromAi && confidence !== "lav") ? "ai" : style ? "stil" : "ai";
  return {
    producer: r.producer || null, vintage: (+r.vintage || vmp?.year || null),
    type: TYPES.includes(r.type) ? r.type : vmpType(vmp?.category) || style?.t || null,
    grape: r.grape || null, region: r.region || [vmp?.district, vmp?.country].filter(Boolean).join(", ") || null,
    dims, profile: String(r.profile || style?.p || "").slice(0, 240), confidence, source,
    style: style?.id || null, styleName: style?.n || null,
    vmp: vmp ? { code: vmp.code, url: vmp.url, name: vmp.name, price: vmp.price } : null,
    at: Date.now(),
  };
}
async function enrichWine(w) {
  const key = profileKey(w);
  const cached = await cachedProfile(key);
  if (cached?.dims && Object.keys(cached.dims).length) {
    let tags = { likes: [], dislikes: [] };
    if (w.note) { try { tags = await askJSON(tagsPrompt(w.note), { kind: "stikkord", tier: "quick", max_tokens: 200 }); } catch (e) { if (TRANSIENT_AI.includes(e.code)) throw e; } }
    return { base: cached, tags };
  }
  const pre = matchStyle(w);
  const vmp = await vmpLookup(w);
  let r = null;
  try { r = await askJSON(enrichPrompt(w, pre, vmp), { kind: "berik", search: true, max_tokens: 700 }); }
  catch (e) {
    // AI utilgjengelig for godt: bruk det vi har (Vinmonopolet og/eller stilen) i stedet for å vente
    if (!TRANSIENT_AI.includes(e.code) && (pre || vmp)) return { base: buildProfile(w, null, pre, vmp), tags: { likes: [], dislikes: [] } };
    throw e;
  }
  const base = buildProfile(w, r, pre, vmp);
  saveProfile(key, base);
  return { base, tags: { likes: r?.likes, dislikes: r?.dislikes } };
}
function mergeAi(w, { base, tags }) {
  const out = { ...w, aiPending: false };
  const fill = (k, v) => { if ((out[k] == null || out[k] === "") && v != null && v !== "") out[k] = v; };
  fill("producer", base.producer); fill("vintage", base.vintage);
  if (!out.type && TYPES.includes(base.type)) out.type = base.type;
  fill("grape", base.grape); fill("region", base.region);
  const tagList = a => (Array.isArray(a) ? a : []).map(s => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 6);
  out.ai = {
    dims: base.dims || {}, profile: base.profile || "", confidence: base.confidence || "middels", source: base.source || "ai",
    style: base.style || null, styleName: base.styleName || null, vmp: base.vmp || null,
    likes: tagList(tags?.likes), dislikes: tagList(tags?.dislikes), at: Date.now(),
  };
  return out;
}
const enrichFailed = new Set();
const enrichErr = new Map();      // vin-id → siste feil, vises i vinens detaljvisning
const toastedErr = new Set();
let enriching = false;
async function runEnrich() {
  if (enriching || !navigator.onLine || !sb) return;
  enriching = true;
  try {
    for (;;) {
      const w = state.wines.find(x => x.aiPending && !enrichFailed.has(x.id));
      if (!w) break;
      try {
        const res = await enrichWine(w);
        const cur = state.wines.find(x => x.id === w.id);
        if (cur) mutate("wines", "upsert", cur.id, mergeAi(cur, res));
      } catch (e) {
        enrichFailed.add(w.id);
        enrichErr.set(w.id, e || {});
        console.warn("Smaksprofil feilet", w.name, e);
        const c = e?.code || "ukjent";
        if (!toastedErr.has(c) && c !== "offline") { toastedErr.add(c); toast("Smaksprofil: " + aiErrText(e)); }
        refreshOpenDetail(); renderLog();
        if (["offline", "daily_limit", "missing_api_key", "bad_api_key", "no_function", "not_signed_in"].includes(e.code)) break;
      }
    }
  } finally { enriching = false; }
}
function retryEnrich() { enrichFailed.clear(); enrichErr.clear(); toastedErr.clear(); refreshOpenDetail(); runEnrich(); }
addEventListener("online", retryEnrich);
// Hjemskjerm-apper på iPhone lastes sjelden på nytt, så prøv igjen når appen åpnes (maks hvert minutt)
let lastRetry = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && enrichFailed.size && Date.now() - lastRetry > 60000) { lastRetry = Date.now(); retryEnrich(); }
});
document.addEventListener("click", e => { if (e.target.closest("[data-retry-enrich]")) { e.preventDefault(); lastRetry = Date.now(); retryEnrich(); } });

/* ================= Shared bits ================= */
// «Tenker»-indikator: AI-stjernen puster og de små stjernene blinker, mens teksten bytter mellom faser.
const THINK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="s0" d="M10 3.5l1.6 4.6a3 3 0 0 0 1.8 1.8L18 11.5l-4.6 1.6a3 3 0 0 0-1.8 1.8L10 19.5l-1.6-4.6a3 3 0 0 0-1.8-1.8L2 11.5l4.6-1.6a3 3 0 0 0 1.8-1.8z"></path><path class="s1" d="M18.5 2.5v4M16.5 4.5h4"></path><path class="s2" d="M19 16.5v3M17.5 18h3"></path></svg>`;
$$("span.think:empty").forEach(e => { e.innerHTML = THINK_SVG; });
const thinkIcon = (cls = "") => `<span class="think ${cls}">${THINK_SVG}</span>`;
const thinkHTML = phrases => `${thinkIcon()}<span class="think-txt" data-phrases="${esc(phrases.join("|"))}">${esc(phrases[0])}</span>`;
setInterval(() => {
  $$(".think-txt[data-phrases]").forEach(el => {
    if (!el.offsetParent) return;
    const ph = el.dataset.phrases.split("|"); if (ph.length < 2) return;
    const i = ((+el.dataset.i || 0) + 1) % ph.length; el.dataset.i = i;
    el.style.opacity = "0";
    setTimeout(() => { el.textContent = ph[i]; el.style.opacity = ""; }, 200);
  });
}, 2600);
// Penere visningsnavn i listene: uten produsent foran, årgang og betegnelser som DOCG/AOC. Lagrede data endres ikke.
const APPELL = /\b(DOCG|DOC|DOCa|DOQ|AOC|AOP|IGT|IGP|VdP|QbA|D\.O\.C?\.?G?\.?|A\.O\.C\.)(?=\s|$|,)/gi;
function cleanName(w) {
  let n = String(w.name || "").replace(/\s+/g, " ").trim();
  if (!n) return "Uten navn";
  const orig = n;
  if (w.vintage) n = n.replace(new RegExp(`(^|\\s)${w.vintage}(?=\\s|$)`), " ");
  n = n.replace(APPELL, " ").replace(/\s+/g, " ").replace(/[\s,·–-]+$/, "").trim();
  const p = String(w.producer || "").trim();
  if (p && n.toLowerCase().startsWith(p.toLowerCase() + " ") && n.length - p.length > 3) n = n.slice(p.length).trim();
  if (n.length < 3) n = orig;
  return n.charAt(0).toLocaleUpperCase("nb-NO") + n.slice(1);
}
const listSub = w => {
  const parts = [w.producer && String(w.producer).trim(), w.vintage].filter(Boolean);
  if (!parts.length) parts.push(...[w.grape, w.region && String(w.region).split(",")[0]].filter(Boolean));
  return parts.map(esc).join(" · ");
};
const metaOf = w => [w.producer, w.grape, w.region && String(w.region).split(",")[0], w.vintage].filter(Boolean).map(esc).join(" · ");
const shortDate = d => { try { return new Date(d + "T12:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short" }); } catch { return ""; } };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const rated = () => state.wines.filter(w => Number.isFinite(w.rating));
const sortedWines = () => [...state.wines].sort((a, b) => (b.drankAt || "").localeCompare(a.drankAt || "") || (b.createdAt || 0) - (a.createdAt || 0));
const CHEV = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>`;
const CAM = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>`;
function swipeRow({ kind, id, lead, title, sub, trail, actions }) {
  return `<div class="swipe" data-kind="${kind}" data-id="${esc(id)}">
    <div class="actions">${actions.map(a => `<button type="button" class="a-${a.c}" data-act="${a.act}">${a.label}</button>`).join("")}</div>
    <div class="row" tabindex="0" role="button">${lead}<div class="main"><div class="t1">${title}</div><div class="t2">${sub}</div></div>${trail || ""}</div>
  </div>`;
}

/* ================= Logg ================= */
function renderLogEyebrow(pending = outbox.length) {
  const r = rated(), n = state.wines.length;
  let t = n ? `${n} ${n === 1 ? "vin" : "viner"}${r.length ? " · snitt " + fmt1(avg(r.map(w => w.rating))) : ""}` : "Din vinlogg";
  if (pending) t += ` · ${pending} venter`;
  $("#logEyebrow").textContent = t;
}
function renderLog() {
  openSwipe = null;
  renderLogEyebrow();
  const el = $("#wineList"), q = $("#logSearch").value.trim().toLowerCase();
  $("#logSearchWrap").hidden = state.wines.length < 6;
  if (!state.wines.length) {
    el.innerHTML = `<div class="empty"><h2>Ingen viner ennå</h2><p>Logg det du drikker og gi det en karakter. Smaksprofilen hentes automatisk, og etter fem til ti viner begynner appen å kjenne smaken din.</p><button class="btn accent" type="button" id="emptyAdd">Legg til første vin</button></div>`;
    $("#emptyAdd").addEventListener("click", () => newWine());
    return;
  }
  const pend = pendingIds();
  const list = sortedWines().filter(w => !q || [w.name, w.producer, w.grape, w.region, w.note, w.vintage].join(" ").toLowerCase().includes(q));
  if (!list.length) { el.innerHTML = `<p class="muted" style="padding:16px 0">Ingen treff på «${esc(q)}».</p>`; return; }
  const groups = [];
  for (const w of list) {
    const key = (w.drankAt || "").slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, items: [] }; groups.push(g); }
    g.items.push(w);
  }
  el.innerHTML = groups.map(g => {
    let label = "Uten dato";
    try { if (g.key) label = cap(new Date(g.key + "-15T12:00:00").toLocaleDateString("nb-NO", { month: "long", year: "numeric" })); } catch {}
    return `<div class="group"><span class="eyebrow">${esc(label)}</span>${g.items.map(w => swipeRow({
      kind: "wine", id: w.id,
      lead: `<span class="glass" style="background:${glass(w.type)}"></span>`,
      title: esc(cleanName(w)),
      sub: `${pend.has(w.id) ? `<i class="pending-dot" title="Venter på nett"></i>` : ""}<span>${listSub(w) || esc(shortDate(w.drankAt))}</span>${w.aiPending && navigator.onLine && !enrichErr.has(w.id) ? thinkIcon("xs") : ""}`,
      trail: `<span class="rate">${Number.isFinite(w.rating) ? w.rating : "–"}</span>`,
      actions: [{ act: "del", label: "Slett", c: "red" }],
    })).join("")}</div>`;
  }).join("");
}
$("#logSearch").addEventListener("input", renderLog);

/* ================= Detail sheets ================= */
let openDetailRef = null;
function openDetail(kind, id) {
  const item = arrOf(kind === "wine" ? "wines" : "cellar").find(x => x.id === id); if (!item) return;
  kind === "wine" ? wineDetail(item) : bottleDetail(item);
}
function refreshOpenDetail() {
  if (!sheetOpen || !openDetailRef) return;
  const { kind, id } = openDetailRef;
  const item = arrOf(kind === "wine" ? "wines" : "cellar").find(x => x.id === id);
  if (!item) { closeSheet(); return; }
  if (kind === "wine") {
    const box = $("#d_ai", sheetBody); if (box) box.innerHTML = aiBlock(item);
    const tg = $("#d_tags", sheetBody); if (tg) tg.innerHTML = tagsHTML(item);
    const mt = $("#d_meta", sheetBody); if (mt) mt.innerHTML = metaOf(item) || "&nbsp;";
  }
}
const tagsHTML = w => [...(w.ai?.likes || []).map(t => `<span class="tag">+ ${esc(t)}</span>`), ...(w.ai?.dislikes || []).map(t => `<span class="tag neg">− ${esc(t)}</span>`)].join("");
function aiBlock(w) {
  if (w.ai && Object.keys(w.ai.dims || {}).length) {
    const src = w.ai.source === "vinmonopolet" ? "fra Vinmonopolet" : w.ai.source === "stil" ? `typisk for ${esc(w.ai.styleName || "stilen")}` : w.ai.confidence === "lav" ? "usikker, typisk for stilen" : "typisk for vinen";
    return `<div style="display:flex;justify-content:space-between;align-items:baseline"><h3 class="eyebrow">Smaksprofil</h3><span class="small" style="color:var(--faint)">${src}</span></div>
      <div class="dims">${DIMS.map(([k, l, words]) => { const v = w.ai.dims[k]; return v ? `<div class="dim"><span class="l">${l}</span><span class="bars">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= v ? "on" : ""}"></i>`).join("")}</span><span class="w">${words[v - 1]}</span></div>` : ""; }).join("")}</div>
      ${w.ai.profile ? `<p class="small muted">${esc(w.ai.profile)}</p>` : ""}
      ${w.ai.source === "vinmonopolet" ? `<p class="small muted">Fylde, syre, tannin og sødme er satt av Vinmonopolets smakspanel.</p>` : ""}
      ${w.ai.vmp?.url ? `<a class="link" style="text-decoration:none;align-self:flex-start" href="${esc(w.ai.vmp.url)}" target="_blank" rel="noopener">Se på Vinmonopolet</a>` : ""}`;
  }
  if (w.aiPending && enrichErr.has(w.id)) {
    const e = enrichErr.get(w.id);
    return `<div style="display:flex;justify-content:space-between;align-items:baseline"><h3 class="eyebrow">Smaksprofil</h3><span class="small" style="color:#C2283A">fikk ikke hentet</span></div>
      <p class="small muted">${esc(aiErrText(e))}</p>
      <p class="small" style="color:var(--faint);font-family:var(--mono,ui-monospace),monospace;word-break:break-word">${esc([e.code, e.status, e.detail].filter(Boolean).join(" · ").slice(0, 300))}</p>
      <button class="btn light" type="button" data-retry-enrich style="align-self:flex-start;height:40px;font-size:15px">Prøv igjen</button>`;
  }
  if (w.aiPending) {
    return `<div style="display:flex;justify-content:space-between;align-items:baseline"><h3 class="eyebrow">Smaksprofil</h3>${navigator.onLine ? `<span class="small progress" style="color:var(--faint);gap:6px">${thinkIcon("sm")}<span class="think-txt" data-phrases="Henter|Slår opp vinen|Setter sammen">Henter</span></span>` : `<span class="small" style="color:var(--faint)">hentes når du er på nett</span>`}</div>
      <div class="dims">${DIMS.map(([, l]) => `<div class="dim"><span class="l">${l}</span><span class="skeleton"></span><span></span></div>`).join("")}</div>`;
  }
  return "";
}
function wineDetail(w) {
  openDetailRef = { kind: "wine", id: w.id };
  const facts = [shortDate(w.drankAt), (WHERE.find(x => x[0] === w.where) || [])[1], w.price ? kr(w.price) : ""].filter(Boolean).map(esc).join(" · ");
  openSheet({
    title: "", left: "", right: "Ferdig", rightPlain: true,
    html: `
      <div class="d-head"><span class="glass lg" style="background:${glass(w.type)}"></span>
        <div class="stack"><h2>${esc(cleanName(w))}</h2><span class="small muted" id="d_meta">${metaOf(w) || "&nbsp;"}</span><span class="small muted">${facts}</span></div></div>
      <div class="d-score"><div style="display:flex;align-items:baseline;gap:6px"><span class="big">${Number.isFinite(w.rating) ? w.rating : "–"}</span><span class="of">/10</span></div><span class="word">${esc(WORDS[w.rating] || "")}</span></div>
      ${w.note ? `<section class="fieldset"><h3 class="eyebrow">Ditt notat</h3><p class="quote">«${esc(w.note)}»</p><div class="tags" id="d_tags">${tagsHTML(w)}</div></section>` : ""}
      <section class="fieldset" id="d_ai">${aiBlock(w)}</section>
      <div class="actions-row"><button type="button" class="btn light" data-a="edit">Rediger</button><button type="button" class="btn dark" data-a="cellar">Legg i kjelleren</button></div>
      <button type="button" class="link danger" data-a="del" style="align-self:flex-start">Slett vin</button>`,
    onClose: () => { openDetailRef = null; },
    mount: b => b.addEventListener("click", e => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      if (a === "edit") wineForm(w, { editingId: w.id });
      else if (a === "cellar") { setTab("kjeller"); bottleForm({ name: w.name, producer: w.producer, vintage: w.vintage, type: w.type, grape: w.grape, region: w.region, price: w.price, qty: 1 }); }
      else if (a === "del") { closeSheet(); removeWithUndo("wine", w.id); }
    }),
  });
}

/* ================= Wine form ================= */
function typePickerHTML(id, val) {
  return `<div class="types" id="${id}" role="radiogroup" aria-label="Type">${TYPES.map(t => `<button type="button" role="radio" aria-checked="${t === val}" data-v="${t}"><span class="glass" style="background:${GLASS[t]}"></span>${TYPE_LABEL[t]}</button>`).join("")}</div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest(".types button"); if (!b) return;
  const on = b.getAttribute("aria-checked") === "true";
  $$("button", b.parentElement).forEach(x => x.setAttribute("aria-checked", "false"));
  if (!on) b.setAttribute("aria-checked", "true");
  b.parentElement.dispatchEvent(new Event("change", { bubbles: true }));
});
const typeVal = el => el?.querySelector('[aria-checked="true"]')?.dataset.v || null;
function ticksHTML(val) {
  return `<div class="ticks" role="radiogroup" aria-label="Karakter fra 1 til 10">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button type="button" role="radio" aria-checked="${n === val}" aria-label="${n} av 10" data-v="${n}"><span class="tick${n % 5 === 0 ? " major" : ""}"></span></button>`).join("")}</div>
    <div class="tick-nums" aria-hidden="true">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<span data-n="${n}">${n}</span>`).join("")}</div>`;
}
function paintTicks(root, val) {
  $$(".ticks button", root).forEach(b => { const n = +b.dataset.v, t = b.firstElementChild; b.setAttribute("aria-checked", String(n === val)); t.classList.toggle("on", n === val); t.classList.toggle("below", val != null && n < val); });
  $$(".tick-nums span", root).forEach(s => s.classList.toggle("on", +s.dataset.n === val));
  $("#w_big", root).textContent = val ?? "–";
  $("#w_word", root).textContent = val ? WORDS[val] : "Velg karakter";
}
function wineFormHTML(f, draftNote) {
  return `
    ${draftNote ? `<div style="display:flex;justify-content:space-between;align-items:center" class="small muted"><span>Utkastet ditt er tatt vare på.</span><button type="button" class="link" id="w_clear">Start på nytt</button></div>` : ""}
    <div class="fieldset">
      <label class="eyebrow" for="w_name">Vin</label>
      <div class="name-row">
        <input id="w_name" type="text" placeholder="Navn på vinen" autocomplete="off" value="${esc(f.name || "")}">
        <input type="file" id="w_scan" accept="image/*" hidden>
        <label for="w_scan" class="icon-btn ghost" aria-label="Skann etiketten">${CAM}</label>
      </div>
      <div class="meta-line" id="w_meta"></div>
      <p class="scan-status" id="w_scanStatus" hidden></p>
    </div>
    <div class="fieldset">
      <span class="eyebrow">Hvor godt likte du den?</span>
      <div class="score"><span class="big" id="w_big">–</span><span class="word" id="w_word"></span></div>
      ${ticksHTML(f.rating)}
    </div>
    <div class="fieldset">
      <label class="eyebrow" for="w_note">Notat</label>
      <div class="note"><textarea id="w_note" rows="5" placeholder="Hva smakte den? Hvorfor likte eller mislikte du den?">${esc(f.note || "")}</textarea></div>
      <p class="hint">Skriv med dine egne ord. Smaksprofilen hentes automatisk, og appen lærer hva du liker av karakteren og det du skriver.</p>
    </div>
    <div class="fieldset">
      <button type="button" class="details-toggle" id="w_more" aria-expanded="false" aria-controls="w_details">Detaljer${CHEV}</button>
      <div id="w_details" class="fieldset" hidden>
        ${typePickerHTML("w_type", f.type || null)}
        <div class="fields">
          <label class="f"><span>Produsent</span><input id="w_producer" type="text" placeholder="Fylles ut automatisk" autocomplete="off" value="${esc(f.producer || "")}"></label>
          <label class="f"><span>Årgang</span><input id="w_vintage" type="number" inputmode="numeric" placeholder="2019" value="${esc(f.vintage ?? "")}"></label>
          <label class="f"><span>Drue</span><input id="w_grape" type="text" placeholder="Fylles ut automatisk" autocomplete="off" value="${esc(f.grape || "")}"></label>
          <label class="f"><span>Region</span><input id="w_region" type="text" placeholder="Fylles ut automatisk" autocomplete="off" value="${esc(f.region || "")}"></label>
          <label class="f"><span>Pris</span><input id="w_price" type="number" inputmode="decimal" placeholder="kr" value="${esc(f.price ?? "")}"></label>
          <label class="f"><span>Dato</span><input id="w_date" type="date" value="${esc(f.drankAt || today())}"></label>
        </div>
        <div class="seg" role="radiogroup" aria-label="Hvor" id="w_where"><span class="thumb"></span>${WHERE.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === (f.where || "restaurant")}" data-v="${v}">${l}</button>`).join("")}</div>
      </div>
    </div>
    <p class="err" id="w_err" hidden></p>`;
}
function readWineForm(b = sheetBody) {
  if (!$("#w_name", b)) return null;
  const rated = $(".ticks [aria-checked='true']", b);
  return {
    name: $("#w_name", b).value.trim(), rating: rated ? +rated.dataset.v : null, note: $("#w_note", b).value.trim(),
    type: typeVal($("#w_type", b)), producer: $("#w_producer", b).value.trim(), vintage: numOrNull($("#w_vintage", b).value),
    grape: $("#w_grape", b).value.trim(), region: $("#w_region", b).value.trim(), price: numOrNull($("#w_price", b).value),
    drankAt: $("#w_date", b).value || today(), where: segVal($("#w_where", b)) || "restaurant",
  };
}
function newWine(prefill) {
  if (!uid) return;
  const draft = !prefill && ls.get(K("draft"), null);
  wineForm(prefill || draft || {}, { draftNote: !!draft });
}
function wineForm(f, { editingId = null, draftNote = false } = {}) {
  let rating = Number.isFinite(f.rating) ? f.rating : null;
  const canSave = () => $("#w_name", sheetBody).value.trim() && rating != null;
  openSheet({
    title: editingId ? "Rediger vin" : "Ny vin", left: "Avbryt", right: editingId ? "Lagre" : "Lagre", rightDisabled: !((f.name || "").trim() && rating != null),
    html: wineFormHTML(f, draftNote),
    mount: b => {
      const meta = () => {
        const d = readWineForm(b), t = d.type;
        const txt = [d.producer, d.grape, d.region, d.vintage].filter(Boolean).map(esc).join(" · ");
        const m = $("#w_meta", b);
        m.classList.toggle("empty-meta", !txt);
        m.innerHTML = txt ? `<span class="glass sm" style="background:${glass(t)}"></span><span>${txt}</span>` : "Produsent, drue og region fylles ut automatisk når du lagrer.";
      };
      const upd = () => { $("#sheetRight").disabled = !canSave(); };
      paintTicks(b, rating); meta();
      $(".ticks", b).addEventListener("click", e => { const t = e.target.closest("button[data-v]"); if (!t) return; rating = +t.dataset.v; paintTicks(b, rating); upd(); });
      $("#w_name", b).addEventListener("input", upd);
      b.addEventListener("input", e => { if (e.target.closest("#w_details")) meta(); });
      b.addEventListener("change", e => { if (e.target.closest("#w_details")) meta(); });
      const more = $("#w_more", b);
      more.addEventListener("click", () => { const open = more.getAttribute("aria-expanded") !== "true"; more.setAttribute("aria-expanded", String(open)); $("#w_details", b).hidden = !open; if (open) requestAnimationFrame(() => placeThumb($("#w_where", b))); });
      $("#w_clear", b)?.addEventListener("click", () => { ls.del(K("draft")); wineForm({}); });
      $("#w_scan", b).addEventListener("change", async e => {
        const file = e.target.files[0]; e.target.value = ""; if (!file) return;
        const r = await scanLabel(file, $("#w_scanStatus", b)); if (!r) return;
        const set = (id, v) => { if (v != null && v !== "") $(id, b).value = v; };
        set("#w_name", r.name); set("#w_producer", r.producer); set("#w_vintage", r.vintage); set("#w_grape", r.grape); set("#w_region", r.region);
        if (TYPES.includes(r.type)) { $$("#w_type button", b).forEach(x => x.setAttribute("aria-checked", String(x.dataset.v === r.type))); }
        meta(); upd();
      });
    },
    onRight: () => {
      const d = readWineForm(); if (!d || !d.name || d.rating == null) return;
      const existing = editingId ? state.wines.find(w => w.id === editingId) : null;
      const changed = !existing || existing.name !== d.name || existing.note !== d.note || existing.producer !== d.producer || existing.vintage !== d.vintage;
      const data = { ...(existing || {}), ...d, createdAt: existing?.createdAt || Date.now(), aiPending: changed ? true : !!existing?.aiPending };
      // Behold AI-felt brukeren ikke har rørt
      if (existing?.ai && !changed) data.ai = existing.ai;
      const id = editingId || uuid();
      sheetCfg.onClose = null;
      if (!editingId) ls.del(K("draft"));
      mutate("wines", "upsert", id, data);
      enrichFailed.delete(id);
      closeSheet();
      toast(editingId ? "Endringene er lagret" : `${d.name} er lagt til`);
      runEnrich();
    },
    onClose: () => {
      if (editingId) return;
      const d = readWineForm();
      if (d && (d.name || d.note || d.rating != null)) ls.set(K("draft"), d); else ls.del(K("draft"));
    },
  });
}
async function scanLabel(file, statusEl) {
  statusEl.hidden = false; statusEl.textContent = "Leser etiketten …";
  try {
    const r = await askJSON(`Bildet viser etiketten på en vinflaske. Les den og svar med ett JSON-objekt:
{"name": string, "producer": string|null, "vintage": number|null, "type": "rød"|"hvit"|"rosé"|"musserende"|"oransje"|"søt"|null, "grape": string|null, "region": string|null, "drinkFrom": number|null, "drinkTo": number|null}
name er vinens navn slik det står på etiketten, uten produsenten hvis den står for seg. grape: druen(e); utled fra appellasjonen når det er standard (Barolo gir Nebbiolo). region skrives som "Region, Land" på norsk. drinkFrom/drinkTo: ditt beste anslag på drikkevindu i årstall, eller null.`, { images: [file], kind: "etikett", tier: "quick", max_tokens: 400 });
    statusEl.textContent = "Fylt ut fra etiketten. Sjekk at det stemmer.";
    return r && typeof r === "object" ? r : null;
  } catch (e) { statusEl.textContent = aiErrText(e); return null; }
}

/* ================= Profile ================= */
const splitList = s => String(s || "").split(/\s*(?:,|\/|&|\+|\bog\b)\s*/i).map(x => x.trim()).filter(Boolean);
/* ---- Favorittdruens opprinnelsesland, vist som en tynn flaggstripe ---- */
const GRAPE_ORIGIN = (() => {
  const m = {
    italia: "nebbiolo, sangiovese, brunello, barbera, dolcetto, pigato, vermentino, nero d'avola, aglianico, montepulciano, corvina, corvinone, rondinella, garganega, glera, prosecco, trebbiano, nerello mascalese, nerello cappuccio, frappato, lagrein, teroldego, fiano, greco, greco di tufo, falanghina, arneis, cortese, verdicchio, sagrantino, negroamaro, lambrusco, grillo, catarratto, carricante, friulano, ribolla gialla, refosco, schiava, gaglioppo, canaiolo, cannonau, grignolino, freisa, ruchè, timorasso, pecorino, passerina, primitivo, traminer, gewürztraminer",
    frankrike: "cabernet sauvignon, merlot, pinot noir, spätburgunder, pinot nero, chardonnay, sauvignon blanc, syrah, shiraz, chenin blanc, gamay, cabernet franc, malbec, côt, carménère, viognier, marsanne, roussanne, sémillon, melon de bourgogne, melon, muscadet, cinsault, cinsaut, petit verdot, tannat, pinot meunier, meunier, pinot blanc, pinot bianco, pinot gris, pinot grigio, aligoté, petit manseng, gros manseng, colombard, ugni blanc, folle blanche, picpoul, durif, petite sirah, mondeuse, savagnin, poulsard, trousseau, jacquère, négrette",
    spania: "tempranillo, tinta roriz, tinto fino, garnacha, grenache, garnatxa, grenache blanc, garnacha blanca, monastrell, mourvèdre, mataró, albariño, verdejo, godello, mencía, macabeo, viura, xarel·lo, xarel-lo, xarello, parellada, cariñena, carignan, mazuelo, graciano, palomino, pedro ximénez, bobal, hondarrabi zuri, prieto picudo",
    portugal: "touriga nacional, touriga franca, tinta barroca, tinto cão, baga, alvarinho, arinto, loureiro, encruzado, castelão, trincadeira, alfrocheiro, fernão pires, avesso",
    tyskland: "riesling, müller-thurgau, rivaner, dornfelder, scheurebe, kerner, trollinger",
    "østerrike": "grüner veltliner, blaufränkisch, kékfrankos, lemberger, zweigelt, st. laurent, sankt laurent, sylvaner, silvaner, rotgipfler, zierfandler",
    hellas: "assyrtiko, xinomavro, agiorgitiko, moschofilero, malagousia, muscat, moscato, moscatel, savatiano, mavrodaphne",
    ungarn: "furmint, hárslevelű, kadarka, juhfark",
    georgia: "saperavi, rkatsiteli, mtsvane, kisi",
    kroatia: "plavac mali, zinfandel, crljenak, pošip",
    "sør-afrika": "pinotage",
    sveits: "chasselas, petite arvine, cornalin, humagne",
    argentina: "torrontés",
  };
  const out = {};
  for (const [land, list] of Object.entries(m)) for (const n of list.split(",")) out[normTxt(n)] = land;
  return out;
})();
const FLAGS = {
  italia: [["#009246", 1], ["#F4F5F0", 1], ["#CE2B37", 1]],
  frankrike: [["#002395", 1], ["#F4F5F0", 1], ["#ED2939", 1]],
  spania: [["#AA151B", 1], ["#F1BF00", 2], ["#AA151B", 1]],
  portugal: [["#046A38", 2], ["#DA291C", 3]],
  tyskland: [["#1A1A1A", 1], ["#DD0000", 1], ["#FFCE00", 1]],
  "østerrike": [["#C8102E", 1], ["#F4F5F0", 1], ["#C8102E", 1]],
  hellas: [["#0D5EAF", 1], ["#F4F5F0", 1], ["#0D5EAF", 1], ["#F4F5F0", 1], ["#0D5EAF", 1]],
  ungarn: [["#CE2939", 1], ["#F4F5F0", 1], ["#477050", 1]],
  georgia: [["#F4F5F0", 1], ["#E8112D", 1], ["#F4F5F0", 1]],
  kroatia: [["#FF0000", 1], ["#F4F5F0", 1], ["#171796", 1]],
  "sør-afrika": [["#007A4D", 2], ["#FFB612", 1], ["#DE3831", 2], ["#002395", 2]],
  sveits: [["#DA291C", 1], ["#F4F5F0", 1], ["#DA291C", 1]],
  argentina: [["#74ACDF", 1], ["#F4F5F0", 1], ["#74ACDF", 1]],
  usa: [["#B22234", 1], ["#F4F5F0", 1], ["#3C3B6E", 1]],
  chile: [["#0039A6", 1], ["#F4F5F0", 1], ["#D52B1E", 1]],
  australia: [["#012169", 3], ["#F4F5F0", 1], ["#E4002B", 1]],
  "new zealand": [["#012169", 3], ["#F4F5F0", 1], ["#C8102E", 1]],
  slovenia: [["#F4F5F0", 1], ["#0000FF", 1], ["#FF0000", 1]],
  libanon: [["#ED1C24", 1], ["#F4F5F0", 2], ["#00A651", .6], ["#F4F5F0", 2], ["#ED1C24", 1]],
  israel: [["#F4F5F0", 1], ["#0038B8", 1], ["#F4F5F0", 1]],
  romania: [["#002B7F", 1], ["#FCD116", 1], ["#CE1126", 1]],
  moldova: [["#0046AE", 1], ["#FFD200", 1], ["#CC092F", 1]],
  bulgaria: [["#F4F5F0", 1], ["#00966E", 1], ["#D62612", 1]],
  canada: [["#D80621", 1], ["#F4F5F0", 2], ["#D80621", 1]],
  uruguay: [["#F4F5F0", 1], ["#0038A8", 1], ["#F4F5F0", 1], ["#0038A8", 1]],
  armenia: [["#D90012", 1], ["#0033A0", 1], ["#F2A800", 1]],
  england: [["#F4F5F0", 1], ["#CE1124", 1], ["#F4F5F0", 1]],
  storbritannia: [["#012169", 2], ["#F4F5F0", 1], ["#C8102E", 1], ["#F4F5F0", 1], ["#012169", 2]],
  tyrkia: [["#E30A17", 1], ["#F4F5F0", 1], ["#E30A17", 1]],
};
const COUNTRY_ALIAS = { "frankrike": "frankrike", "france": "frankrike", "italy": "italia", "spain": "spania", "germany": "tyskland", "austria": "østerrike", "greece": "hellas", "hungary": "ungarn", "croatia": "kroatia", "south africa": "sør-afrika", "sor-afrika": "sør-afrika", "sør afrika": "sør-afrika", "switzerland": "sveits", "usa": "usa", "united states": "usa", "california": "usa", "oregon": "usa", "new zealand": "new zealand", "ny zealand": "new zealand", "new-zealand": "new zealand", "lebanon": "libanon", "uk": "storbritannia", "england": "england", "turkey": "tyrkia" };
const countryKey = c => { const n = String(c || "").trim().toLowerCase(); return FLAGS[n] ? n : COUNTRY_ALIAS[n] || null; };
function grapeCountry(grape) {
  const g = normTxt(grape);
  if (GRAPE_ORIGIN[g]) return GRAPE_ORIGIN[g];
  // Reserve: landet flest av vinene dine med denne druen kommer fra
  const n = {};
  for (const w of state.wines) if (grapeKeys(w).some(k => normTxt(k) === g)) { const c = countryKey(String(w.region || "").split(",").pop()); if (c) n[c] = (n[c] || 0) + 1; }
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
const flagStripe = land => { const f = FLAGS[land]; if (!f) return ""; const label = land === "usa" ? "USA" : cap(land);
  return `<span class="fstripe" role="img" aria-label="${esc(label)}" title="${esc(label)}">${f.map(([c, w]) => `<i style="flex:${w};background:${c}"${c === "#F4F5F0" ? ' class="w"' : ""}></i>`).join("")}</span>`; };

function groupScores(getKeys) {
  const W = rated(), g = {}, m = avg(W.map(w => w.rating));
  for (const w of W) for (const k of getKeys(w)) { const key = cap(k); (g[key] ??= { n: 0, s: 0 }); g[key].n++; g[key].s += w.rating; }
  return Object.entries(g).map(([k, v]) => ({ k, n: v.n, avg: v.s / v.n, score: (v.s + 2 * m) / (v.n + 2) })).sort((a, b) => b.score - a.score || b.n - a.n);
}
const grapeKeys = w => splitList(w.grape).map(x => x.toLowerCase());
const regionKeys = w => [String(w.region || "").split(",")[0].trim().toLowerCase()].filter(Boolean);
function dimProfile() {
  const liked = {}, all = {};
  for (const [k] of DIMS) {
    let ws = 0, wv = 0; const vals = [];
    for (const w of rated()) { const v = w.ai?.dims?.[k]; if (!v) continue; vals.push(v); const wt = Math.max(0, w.rating - 5); ws += wt; wv += wt * v; }
    all[k] = vals.length ? avg(vals) : null; liked[k] = ws > 0 ? wv / ws : null;
  }
  return { liked, all };
}
function tagCounts() {
  const likes = {}, dislikes = {};
  for (const w of rated()) {
    for (const t of w.ai?.likes || []) if (w.rating >= 6) likes[t] = (likes[t] || 0) + 1;
    for (const t of w.ai?.dislikes || []) dislikes[t] = (dislikes[t] || 0) + 1;
  }
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
  return { likes: top(likes), dislikes: top(dislikes) };
}
function profileText() {
  const W = rated();
  if (!W.length) return "Ingen viner logget ennå.";
  const L = [`Antall viner: ${W.length}. Snittkarakter: ${fmt1(avg(W.map(w => w.rating)))} av 10 (de fleste gir 6 til 9).`];
  const gr = groupScores(grapeKeys).slice(0, 8).map(g => `${g.k} ${fmt1(g.avg)} (${g.n})`).join(", "); if (gr) L.push("Druer, best først: " + gr);
  const rg = groupScores(regionKeys).slice(0, 8).map(g => `${g.k} ${fmt1(g.avg)} (${g.n})`).join(", "); if (rg) L.push("Regioner, best først: " + rg);
  const { liked } = dimProfile();
  const ld = DIMS.filter(([k]) => liked[k] != null).map(([k, l]) => `${l} ${fmt1(liked[k])}`).join(", ");
  if (ld) L.push("Typisk smaksprofil i vinene de liker best (1–5): " + ld);
  const tc = tagCounts();
  if (tc.likes.length) L.push("Ting de ofte nevner positivt: " + tc.likes.join(", "));
  if (tc.dislikes.length) L.push("Ting de ofte trekker for: " + tc.dislikes.join(", "));
  L.push("Viner (karakter | vin | type | drue | region | notat):");
  for (const w of sortedWines().filter(w => Number.isFinite(w.rating)).slice(0, 40)) {
    L.push(`${w.rating} | ${w.name}${w.vintage ? " " + w.vintage : ""}${w.producer ? " (" + w.producer + ")" : ""} | ${w.type || "?"} | ${w.grape || "?"} | ${w.region || "?"} | ${(w.note || "").slice(0, 140)}`);
  }
  return L.join("\n");
}
function cellarText() {
  const c = state.cellar.filter(b => (b.qty || 0) > 0);
  if (!c.length) return "Kjelleren er tom.";
  return c.map(b => `${b.qty} stk | ${b.name}${b.vintage ? " " + b.vintage : ""}${b.producer ? " (" + b.producer + ")" : ""} | ${b.type || "?"} | ${b.grape || "?"} | ${b.region || "?"} | drikkevindu ${b.drinkFrom || "?"}–${b.drinkTo || "?"}`).join("\n");
}
function radar(liked, all) {
  const cx = 171, cy = 118, R = 88;
  const pt = (i, v) => { const a = (-90 + i * 60) * Math.PI / 180, r = R * v / 5; return [Math.round((cx + r * Math.cos(a)) * 10) / 10, Math.round((cy + r * Math.sin(a)) * 10) / 10]; };
  const poly = vals => DIMS.map(([k], i) => pt(i, vals[k] ?? 0).join(",")).join(" ");
  let g = "";
  for (let lv = 2; lv <= 5; lv++) g += `<polygon points="${DIMS.map((_, i) => pt(i, lv).join(",")).join(" ")}" fill="none" stroke="var(--line)" stroke-width="${lv === 5 ? 1 : .8}"/>`;
  DIMS.forEach((d, i) => {
    const [x, y] = pt(i, 5); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)" stroke-width=".8"/>`;
    const extra = i === 0 ? .55 : i === 3 ? .75 : .4, [lx, ly] = pt(i, 5 + extra);
    const anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
    g += `<text x="${lx}" y="${ly + 4}" text-anchor="${anchor}" font-size="11" fill="var(--muted)" style="font-family:var(--font)">${d[1]}</text>`;
  });
  if (DIMS.some(([k]) => all[k] != null)) g += `<polygon points="${poly(all)}" fill="none" stroke="var(--faint)" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  if (DIMS.some(([k]) => liked[k] != null)) g += `<polygon points="${poly(liked)}" fill="var(--accent)" fill-opacity=".10" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round"/>`;
  return `<svg viewBox="0 0 342 236" role="img" aria-label="Smaksavtrykk">${g}</svg>`;
}
// «Om smaken din»: lagres på telefonen og skrives på nytt av seg selv for hver tredje nye vin du gir karakter.
const PROFILE_EVERY = 3;
let profileCtl = null, profileRun = null, profileAutoFailAt = 0;
const savedProfile = () => ls.get(K("profileAi"), null);
function renderProfile() {
  const W = rated(), el = $("#profileBody"), sp = savedProfile();
  $("#profEyebrow").textContent = displayName(state.user);
  let html = "";
  if (!W.length) {
    html += `<div class="empty" style="padding-bottom:26px"><h2>Profilen bygges her</h2><p>Gi vinene du drikker en karakter. Etter fem til ti viner ser du hva du faktisk liker.</p></div>`;
  } else {
    const fav = groupScores(grapeKeys)[0];
    const { liked, all } = dimProfile(), hasDims = DIMS.some(([k]) => all[k] != null);
    const tc = tagCounts();
    html += `<div class="stats">
        <div><span class="v">${W.length}</span><span class="k">${W.length === 1 ? "vin" : "viner"}</span></div>
        <div><span class="v">${fmt1(avg(W.map(w => w.rating)))}</span><span class="k">i snitt</span></div>
        <div>${fav ? `<span class="fav"><span class="v word">${esc(fav.k)}</span>${flagStripe(grapeCountry(fav.k))}</span>` : `<span class="v word">–</span>`}<span class="k">favorittdrue</span></div></div>
      <section class="panel">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="eyebrow">Smaksavtrykk</h2>
          <span class="legend"><span><i style="background:var(--accent)"></i>Det du liker</span><span><i style="background:var(--faint)"></i>Alt</span></span></div>
        ${hasDims ? `<div class="radar">${radar(liked, all)}</div>` : `<p class="small muted">Tegnes når smaksprofilene til vinene dine er hentet.</p>`}
      </section>
      <button type="button" class="next-cta" id="nextGo"><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3.5l1.6 4.6a3 3 0 0 0 1.8 1.8L18 11.5l-4.6 1.6a3 3 0 0 0-1.8 1.8L10 19.5l-1.6-4.6a3 3 0 0 0-1.8-1.8L2 11.5l4.6-1.6a3 3 0 0 0 1.8-1.8z"></path><path d="M18.5 2.5v4M16.5 4.5h4"></path><path d="M19 16.5v3M17.5 18h3"></path></svg></span><span class="tx"><b>Hva bør jeg velge neste gang?</b><span>AI-forslag ut fra smaken din</span></span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></button>
      ${tc.likes.length || tc.dislikes.length ? `<section class="panel"><h2 class="eyebrow">Gjennomgående</h2><div class="tags">${tc.likes.map(t => `<span class="tag">+ ${esc(t)}</span>`).join("")}${tc.dislikes.map(t => `<span class="tag neg">− ${esc(t)}</span>`).join("")}</div></section>` : ""}
      <section class="panel"><h2 class="eyebrow">Om smaken din</h2>
        ${sp?.text ? `<p class="ai-text" id="aiOut">${esc(sp.text)}</p>` : `<p class="small muted" id="aiOut">${W.length < PROFILE_EVERY ? `Skrives når du har gitt karakter til ${PROFILE_EVERY} viner.` : ""}</p>`}
        <div class="progress" id="aiStatus" ${profileRun ? "" : "hidden"}>${thinkHTML(sp?.text ? ["Oppdaterer med de nye vinene", "Ser etter mønstre", "Skriver"] : ["Leser profilen", "Ser etter mønstre", "Skriver"])}</div>
        <p class="err" id="aiErr" hidden></p>
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px">
          <span class="small" style="color:var(--faint)">${sp?.text ? `Basert på ${sp.n} ${sp.n === 1 ? "vin" : "viner"} · ${W.length - sp.n > 0 ? `${W.length - sp.n} ny${W.length - sp.n === 1 ? "" : "e"} siden sist` : "oppdatert"}` : ""}</span>
          <button class="link" type="button" id="aiGo" style="flex:none" ${profileRun ? "disabled" : ""}>${sp?.text ? "Oppdater nå" : "Skriv nå"}</button>
        </div>
      </section>`;
  }
  html += `<button type="button" class="settings-btn" id="settingsBtn"><svg class="gear" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg><span>Innstillinger</span><span class="v">${esc(displayName(state.user))}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></button>`;
  el.innerHTML = html;
  $("#settingsBtn").addEventListener("click", settingsSheet);
  $("#aiGo")?.addEventListener("click", () => runProfileAI());
  $("#nextGo")?.addEventListener("click", nextSheet);
  // Automatisk oppdatering: første gang ved 3 viner, deretter for hver tredje nye
  if (W.length >= PROFILE_EVERY && !profileRun && navigator.onLine && Date.now() - profileAutoFailAt > 10 * 60000
      && (!sp?.text || W.length - (sp.n || 0) >= PROFILE_EVERY)) runProfileAI({ auto: true });
}
function settingsSheet() {
  openSheet({ title: "Innstillinger", left: "", right: "Ferdig", rightPlain: true, html: accountHTML(), mount: () => bindAccount() });
}
async function runProfileAI({ auto = false } = {}) {
  if (profileRun) return profileRun;
  const n = rated().length;
  profileCtl = new AbortController();
  profileRun = (async () => {
    try {
      const text = (await ask(`Du er en erfaren sommelier. Under er vinprofilen til en person, bygget fra viner de har gitt karakter (1–10) og notatene deres.

${profileText()}

Skriv på norsk bokmål, rett til personen (du-form), uten overskrifter, punktlister eller markdown:
1. 3–5 setninger om hva smaken deres faktisk er: hvilke stiler, druer og strukturer de belønner, og hva de trekker for. Vis til konkrete viner og til det de selv har skrevet. Si fra hvis datagrunnlaget er tynt.
2. Avslutt med to konkrete forslag til viner eller stiler de bør prøve, ett trygt og ett som utfordrer smaken litt.
Ikke bruk tankestrek som skilletegn.`, { signal: profileCtl.signal, kind: "profil", max_tokens: 900 })).trim();
      if (text) ls.set(K("profileAi"), { text, n, at: Date.now() });
    } catch (e) {
      if (auto) profileAutoFailAt = Date.now();
      if (e.code !== "cancelled") { const err = $("#aiErr"); if (err && state.tab === "profil") { err.textContent = aiErrText(e); err.hidden = false; } }
      const st = $("#aiStatus"), go = $("#aiGo"); if (st) st.hidden = true; if (go) go.disabled = false;
      return;
    } finally { profileRun = null; }
    if (state.tab === "profil") renderProfile();
  })();
  if (state.tab === "profil") { const st = $("#aiStatus"), go = $("#aiGo"); if (st) st.hidden = false; if (go) go.disabled = true; }
  return profileRun;
}

/* ---- Neste vin: AI-forslag (rød/hvit/musserende, trygt eller utfordrende) ---- */
let nextCtl = null;
function nextSheet() {
  const last = ls.get(K("nextPick"), { type: "rød", mode: "trygt" });
  const seg = (id, label, opts, cur) => `<div class="fieldset"><span class="eyebrow">${label}</span>
    <div class="seg" role="radiogroup" aria-label="${label}" id="${id}"><span class="thumb"></span>${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-v="${v}">${l}</button>`).join("")}</div></div>`;
  openSheet({
    title: "Neste vin", left: "", right: "Ferdig", rightPlain: true,
    html: `${seg("nx_type", "Type", [["rød", "Rød"], ["hvit", "Hvit"], ["musserende", "Musserende"]], last.type)}
      ${seg("nx_mode", "Hva vil du ha?", [["trygt", "Sikker vinner"], ["nytt", "Utfordre meg"]], last.mode)}
      <p class="hint" id="nx_hint"></p>
      <button class="btn accent block" type="button" id="nx_go">Finn forslag</button>
      <div class="progress" id="nx_status" hidden>${thinkHTML(["Tenker på smaken din", "Leter etter viner", "Velger de beste"])}<button class="link muted" id="nx_stop" type="button" style="margin-left:auto">Stopp</button></div>
      <p class="err" id="nx_err" hidden></p>
      <div id="nx_out"></div>`,
    onClose: () => nextCtl?.abort(),
    mount: b => {
      const hint = () => { $("#nx_hint", b).textContent = segVal($("#nx_mode", b)) === "nytt"
        ? "En ny vin som er annerledes enn det du pleier å drikke, men ikke noe du helt sikkert ville mislikt."
        : "En ny vin du ikke har smakt, som du med stor sannsynlighet kommer til å like."; };
      hint(); $("#nx_mode", b).addEventListener("click", () => setTimeout(hint));
      $("#nx_stop", b).addEventListener("click", () => nextCtl?.abort());
      $("#nx_go", b).addEventListener("click", () => runNext(b));
    },
  });
}
async function runNext(b) {
  const type = segVal($("#nx_type", b)) || "rød", mode = segVal($("#nx_mode", b)) || "trygt";
  ls.set(K("nextPick"), { type, mode });
  const where = segVal($("#buyWhere")) || "no";
  const shop = where === "no" ? "Vinmonopolet i Norge (priser i NOK)" : where === "fr" ? "en vanlig vinbutikk eller cave i Frankrike (oppgi pris i euro)" : "en vanlig vinbutikk";
  const go = $("#nx_go", b), st = $("#nx_status", b), err = $("#nx_err", b), out = $("#nx_out", b);
  nextCtl = new AbortController(); go.disabled = true; st.hidden = false; err.hidden = true; out.innerHTML = "";
  const TYPE_TXT = { "rød": "rødvin", "hvit": "hvitvin", "musserende": "musserende vin (champagne, crémant, cava, franciacorta, pet-nat o.l.)" };
  try {
    const r = await askJSON(`Du er sommelier og foreslår hvilken vin personen bør velge neste gang. Smaksprofilen deres, bygget fra viner de har gitt karakter (1–10) og notatene deres:
${profileText()}

De vil ha: ${TYPE_TXT[type]}.
${mode === "trygt"
  ? "Mål: en SIKKER VINNER. Foreslå viner de ikke har smakt (ingen av vinene i profilen over), men som de nesten garantert vil like. Hold deg tett på stilene, druene, regionene og strukturen de har gitt høyest karakter og skrevet positivt om, og styr helt unna det de har trukket for eller mislikt. match skal være høy."
  : "Mål: UTFORDRE SMAKSLØKENE. Foreslå viner de ikke har smakt, i druer, regioner eller stiler som er annerledes enn det de pleier å drikke: enten noe de aldri har prøvd, eller en stil de har prøvd men ikke gitt høy karakter, fordi et godt eksempel kan endre mening. Unngå det de nesten helt sikkert ikke vil like, altså egenskaper de gjentatte ganger har mislikt eller gitt lav karakter (for eksempel mye eik, høy sødme eller lav syre hvis det er det de trekker for). Forklar kort hva som er nytt og hvorfor de likevel kan like det."}
De kjøper hos: ${shop}. Velg viner som er vanlige å finne der; du kan ikke sjekke lagerstatus, så velg heller kjente produsenter enn sjeldne. Prisene er omtrentlige.${rated().length < 3 ? " Profilen er tynn, så si det kort i note." : ""}

JSON-format:
{"picks": [{"name": "vin med produsent", "style": "Type · Drue · Region", "price": "omtrentlig pris", "match": 0-100, "why": "1–2 setninger om hvorfor, med henvisning til viner de har vurdert eller det de har skrevet"}], "note": "én kort setning" | null}

Gi 3 forslag, beste først. All tekst på norsk bokmål, uten tankestrek som skilletegn.`, { signal: nextCtl.signal, kind: "kjop", max_tokens: 1300 });
    renderPicks(out, r, "buy", where);
  } catch (e) { if (e?.code !== "cancelled") { err.textContent = aiErrText(e); err.hidden = false; } }
  finally { go.disabled = false; st.hidden = true; go.textContent = "Nye forslag"; }
}

/* ---- Account ---- */
const displayName = u => { const e = u?.email || ""; return e.endsWith("@" + (CFG.userDomain || "")) ? e.split("@")[0] : e; };
function accountHTML() {
  return `<section class="panel" style="border-top:0;padding-top:0"><h2 class="eyebrow">Konto</h2><div class="list-rows">
    <div><span>Innlogget som</span><span class="v">${esc(displayName(state.user))}</span></div>
    <div><span>AI-kall siste døgn</span><span class="v" id="usageV">…</span></div>
    <div><span>Venter på å lagres</span><span class="v">${outbox.length ? outbox.length + " endringer" : "ingenting"}</span></div>
    <button type="button" id="aiTestBtn"><span>Test AI-tilkobling</span><span class="v" id="aiTestV"></span></button>
    <button type="button" id="exportBtn"><span>Eksporter alt</span><span class="v">JSON</span></button>
    <button type="button" id="pwBtn"><span>Bytt passord</span><span class="v"></span></button>
    <button type="button" id="logoutBtn" style="color:#C2283A"><span>Logg ut</span><span class="v"></span></button>
  </div>${matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "" : `<p class="hint">Legg appen på hjemskjermen: Del-knappen i Safari → «Legg til på Hjem-skjerm».</p>`}</section>`;
}
function bindAccount() {
  $("#logoutBtn").addEventListener("click", async () => {
    if (outbox.length && !confirmInline("#logoutBtn", "Du har endringer som ikke er lagret ennå. Trykk igjen for å logge ut likevel.")) return;
    ls.del(K("cache")); ls.del(K("outbox")); ls.del(K("draft")); ls.del(K("profileAi"));
    await sb.auth.signOut();
  });
  $("#pwBtn").addEventListener("click", passwordSheet);
  $("#exportBtn").addEventListener("click", exportData);
  $("#aiTestBtn").addEventListener("click", testAi);
  sb.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 864e5).toISOString())
    .then(({ count, error }) => { const v = $("#usageV"); if (v) v.textContent = error ? "–" : `${count ?? 0}`; }, () => {});
}
async function testAi() {
  const v = $("#aiTestV"); if (!v || v.dataset.busy) return;
  v.dataset.busy = "1"; v.textContent = "tester …";
  const t0 = Date.now();
  try {
    const txt = await ask("Svar bare med ordet OK.", { kind: "test", tier: "quick", max_tokens: 50 });
    v.textContent = `virker (${((Date.now() - t0) / 1000).toFixed(1)} s)`;
    toast(`AI svarte: ${String(txt).trim().slice(0, 40) || "(tomt svar)"}`);
    retryEnrich();
  } catch (e) {
    v.textContent = e?.code || "feil";
    toast(aiErrText(e) + (e?.detail ? ` (${String(e.detail).slice(0, 120)})` : ""));
  } finally { delete v.dataset.busy; }
}
function confirmInline(sel, msg) {
  const b = $(sel);
  if (b.dataset.armed === "1") return true;
  b.dataset.armed = "1"; toast(msg);
  setTimeout(() => { if (b.isConnected) b.dataset.armed = ""; }, 4000);
  return false;
}
async function exportData() {
  const payload = { app: "Vinprofil", exportedAt: new Date().toISOString(), user: displayName(state.user), wines: state.wines, cellar: state.cellar };
  const name = `vinprofil-${displayName(state.user)}-${today()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  try {
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Vinprofil-eksport" }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function passwordSheet() {
  openSheet({
    title: "Bytt passord", left: "Avbryt", right: "Lagre", rightDisabled: true,
    html: `<div class="fields">
      <label class="f"><span>Nytt</span><input id="pw1" type="password" autocomplete="new-password" placeholder="Minst 8 tegn"></label>
      <label class="f"><span>Gjenta</span><input id="pw2" type="password" autocomplete="new-password" placeholder="Samme igjen"></label>
    </div><p class="hint">Passordet gjelder på alle enhetene dine.</p><p class="err" id="pwErr" hidden></p>`,
    mount: b => { const check = () => { const a = $("#pw1", b).value, c = $("#pw2", b).value; $("#sheetRight").disabled = !(a.length >= 8 && a === c); }; $("#pw1", b).addEventListener("input", check); $("#pw2", b).addEventListener("input", check); },
    onRight: async () => {
      const R = $("#sheetRight"); R.disabled = true;
      const { error } = await sb.auth.updateUser({ password: $("#pw1").value });
      if (error) { R.disabled = false; const e = $("#pwErr"); e.textContent = /different|same/i.test(error.message) ? "Velg et annet passord enn det du har nå." : "Kunne ikke bytte passord. Prøv igjen."; e.hidden = false; return; }
      closeSheet(); toast("Passordet er byttet");
    },
  });
}

/* ================= Råd ================= */
function setRadMode(mode) {
  state.radMode = mode;
  $("#menuPane").hidden = mode !== "menu"; $("#buyPane").hidden = mode !== "buy";
  if (mode === "buy") requestAnimationFrame(() => placeThumb($("#buyWhere")));
}
// Stikkordfelt: forslag og egne ord blir bobler med x. Komma eller punktum gjør teksten til en boble.
const TAGS = {};
const XSVG = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"></path></svg>`;
function tagField(key, items) {
  const box = $("#" + key + "Box"), tf = $(".tf", box), ta = $("#" + key + "Intent"), sg = $("#" + key + "Chips");
  const st = TAGS[key] = { tokens: [], value: () => [...st.tokens, ta.value.replace(/[,.]\s*$/, "").trim()].filter(Boolean).join(", ") };
  const fit = () => { ta.style.height = "32px"; ta.style.height = Math.max(32, ta.scrollHeight) + "px"; };
  const render = () => {
    $$(".tok", tf).forEach(n => n.remove());
    st.tokens.forEach((t, i) => {
      const s = document.createElement("span"); s.className = "tok";
      s.innerHTML = `<span>${esc(t)}</span><button type="button" aria-label="Fjern ${esc(t)}">${XSVG}</button>`;
      s.querySelector("button").addEventListener("click", e => { e.stopPropagation(); st.tokens.splice(i, 1); render(); });
      tf.insertBefore(s, ta);
    });
    ta.placeholder = st.tokens.length ? "Legg til mer" : ta.dataset.ph;
    sg.innerHTML = items.filter(t => !st.tokens.some(x => x.toLowerCase() === t.toLowerCase())).map(t => `<button type="button">${esc(t)}</button>`).join("");
    $$("button", sg).forEach(b => b.addEventListener("click", () => add(b.textContent)));
  };
  const add = t => {
    t = String(t).replace(/^[\s,.]+|[\s,.]+$/g, "");
    if (t && !st.tokens.some(x => x.toLowerCase() === t.toLowerCase())) st.tokens.push(t);
    render();
  };
  ta.dataset.ph = ta.placeholder;
  ta.addEventListener("input", () => {
    if (/[,.]\s*$/.test(ta.value) || /\n/.test(ta.value)) { add(ta.value); ta.value = ""; }
    fit();
  });
  ta.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); if (ta.value.trim()) { add(ta.value); ta.value = ""; fit(); } else ta.blur(); }
    else if (e.key === "Backspace" && !ta.value && st.tokens.length) { st.tokens.pop(); render(); }
  });
  ta.addEventListener("blur", () => { if (ta.value.trim().length > 1 && ta.value.trim().length < 40) { add(ta.value); ta.value = ""; fit(); } });
  tf.addEventListener("click", e => { if (e.target === tf) ta.focus(); });
  render();
}
tagField("menu", ["Trygt valg", "Noe nytt for meg", "Best verdi", "Til fisk", "Til kjøtt", "Til skalldyr", "Til ost"]);
tagField("buy", ["Middag hjemme", "Gave", "Til lagring", "Sommerkveld", "Pizza", "Til fisk", "Til vilt"]);
const styleParts = style => {
  const st = String(style || "").split("·").map(s => s.trim());
  const t = TYPES.find(t => (st[0] || "").toLowerCase().startsWith(t.slice(0, 3)));
  return { type: t || null, grape: st[1] || "", region: st[2] || "" };
};
function pickHTML(p, i, acts) {
  const m = Math.max(0, Math.min(100, Math.round(Number(p.match) || 0)));
  return `<article class="pick rise" style="animation-delay:${i * 50}ms" data-i="${i}">
    <div class="top"><span class="glass" style="background:${glass(styleParts(p.style).type)}"></span>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span class="nm">${esc(p.name)}</span><span class="small muted">${[esc(p.style), p.price ? esc(p.price) : ""].filter(Boolean).join(" · ")}</span></div>
      <span class="pct">${m}<small>%</small></span></div>
    <p class="why">${esc(p.why)}</p>
    <div class="acts">${acts}</div>
  </article>`;
}
let menuFiles = [], menuCtl = null;
function renderPhotos() {
  const el = $("#menuPhotos");
  $$("img, .rm", el).forEach(n => n.remove());
  const add = $(".add-photo", el);
  menuFiles.forEach((f, i) => { const img = document.createElement("img"); img.src = URL.createObjectURL(f); img.alt = `Side ${i + 1} av vinkartet`; el.insertBefore(img, add); });
  $("#menuHint").textContent = menuFiles.length ? `${menuFiles.length} ${menuFiles.length === 1 ? "side" : "sider"}` : "Ta bilde av vinkartet. Flere sider går fint.";
  add.hidden = menuFiles.length >= 4;
  if (menuFiles.length) { const rm = document.createElement("button"); rm.type = "button"; rm.className = "link muted rm"; rm.textContent = "Fjern"; rm.onclick = () => { menuFiles = []; renderPhotos(); }; el.appendChild(rm); }
}
$("#menuInput").addEventListener("change", e => { menuFiles = [...menuFiles, ...e.target.files].slice(0, 4); e.target.value = ""; $("#menuErr").hidden = true; renderPhotos(); });
$("#menuStop").addEventListener("click", () => menuCtl?.abort());
function busy(p, on) { $("#" + p + "Go").disabled = on; $("#" + p + "Status").hidden = !on; if (on) $("#" + p + "Err").hidden = true; }
function showErr(p, e) { if (e?.code === "cancelled") return; const el = $("#" + p + "Err"); el.textContent = aiErrText(e); el.hidden = false; }
$("#menuGo").addEventListener("click", async () => {
  if (!menuFiles.length) { $("#menuErr").textContent = "Ta bilde av vinkartet først."; $("#menuErr").hidden = false; return; }
  menuCtl = new AbortController(); busy("menu", true); $("#menuOut").innerHTML = "";
  try {
    const r = await askJSON(`Du er sommelier og hjelper en person å velge fra vinkartet på en restaurant. Bildet/bildene viser vinkartet.

Smaksprofilen deres, bygget fra viner de har gitt karakter (1–10) og notatene deres:
${profileText()}

Det de vil ha i kveld: ${TAGS.menu.value() || "ikke oppgitt"}

Les vinkartet og velg de tre vinene som passer best til smaken deres og kveldens ønske. Velg bare viner som faktisk står på kartet, og bruk prisene slik de står. Har de vurdert en vin som står på kartet, ta hensyn til karakteren.

JSON-format:
{"readable": true|false, "picks": [{"name": "vinen slik den står på kartet, med årgang", "price": "prisen slik den står, eller null", "style": "Type · Drue · Region, f.eks. Rød · Nebbiolo · Piemonte", "match": 0-100, "why": "1–2 setninger om hvorfor den passer DERES profil, gjerne med henvisning til viner de har vurdert eller det de har skrevet"}], "skip": {"name": "...", "why": "én setning"} | null, "note": "én kort setning hvis kartet var vanskelig å lese eller profilen er tynn" | null}

Sorter picks med beste match først. All tekst på norsk bokmål, uten tankestrek som skilletegn.`, { images: menuFiles, signal: menuCtl.signal, kind: "vinkart", max_tokens: 1500 });
    renderPicks($("#menuOut"), r, "menu");
  } catch (e) { showErr("menu", e); }
  finally { busy("menu", false); }
});
let buyCtl = null;
$("#buyStop").addEventListener("click", () => buyCtl?.abort());
$("#buyGo").addEventListener("click", async () => {
  const intent = TAGS.buy.value();
  if (!intent) { $("#buyErr").textContent = "Skriv kort hva vinen skal brukes til."; $("#buyErr").hidden = false; $("#buyIntent").focus(); return; }
  buyCtl = new AbortController(); busy("buy", true); $("#buyOut").innerHTML = "";
  const budget = numOrNull($("#buyBudget").value), where = segVal($("#buyWhere")) || "no", useCellar = $("#buyCellar").checked;
  const shop = where === "no" ? "Vinmonopolet i Norge (priser i NOK)" : where === "fr" ? "en vanlig vinbutikk eller cave i Frankrike (oppgi pris i euro)" : "en vanlig vinbutikk";
  try {
    const r = await askJSON(`Du er sommelier og gir personlige kjøpsråd. Smaksprofilen til personen, bygget fra viner de har gitt karakter (1–10) og notatene deres:
${profileText()}

${useCellar ? "Flasker de allerede har i kjelleren:\n" + cellarText() + "\n" : ""}
Kvelden/ønsket: ${intent}
Budsjett per flaske: ${budget ? budget + " kr" + (where === "fr" ? " (regn om til euro)" : "") : "ikke oppgitt"}
De kjøper hos: ${shop}

${useCellar ? "Sjekk først om noe i kjelleren passer, og ta hensyn til drikkevinduet (nå er det " + YEAR + "). " : ""}Foreslå så 3 flasker å kjøpe som passer smaken og anledningen. Velg viner som er vanlige å finne hos ${shop}; du kan ikke sjekke lagerstatus, så velg heller kjente produsenter enn sjeldne. Prisene er omtrentlige.

JSON-format:
{"from_cellar": [{"name": "...", "why": "én setning"}], "picks": [{"name": "vin med produsent", "style": "Type · Drue · Region", "price": "omtrentlig pris", "match": 0-100, "why": "1–2 setninger om hvorfor den passer DERES profil og kvelden"}], "tip": "ett kort råd om temperatur eller lufting" | null}

from_cellar er tom liste hvis ingenting passer. Sorter picks med beste match først. All tekst på norsk bokmål, uten tankestrek som skilletegn.`, { signal: buyCtl.signal, kind: "kjop", max_tokens: 1500 });
    renderPicks($("#buyOut"), r, "buy", where);
  } catch (e) { showErr("buy", e); }
  finally { busy("buy", false); }
});
function renderPicks(el, r, kind, where) {
  if (!r || typeof r !== "object") { el.innerHTML = `<p class="err">Fikk ikke et brukbart svar. Prøv igjen.</p>`; return; }
  const picks = Array.isArray(r.picks) ? r.picks : [];
  let h = "";
  if (kind === "menu" && r.readable === false) h += `<div class="banner">Vinkartet var vanskelig å lese. Prøv et skarpere bilde med mindre gjenskinn.</div>`;
  if (kind === "buy" && Array.isArray(r.from_cellar) && r.from_cellar.length) h += `<div class="fieldset rise" style="margin-bottom:18px"><span class="eyebrow">Du har allerede</span>${r.from_cellar.map(c => `<p><strong style="font-weight:500">${esc(c.name)}</strong><br><span class="small muted">${esc(c.why)}</span></p>`).join("")}</div>`;
  h += picks.map((p, i) => pickHTML(p, i, kind === "menu"
    ? `<button type="button" class="link" data-act="log">Jeg tok denne</button>`
    : `${where === "no" ? `<a class="link" style="text-decoration:none" href="https://www.vinmonopolet.no/search?q=${encodeURIComponent(p.name)}" target="_blank" rel="noopener">Søk på Vinmonopolet</a>` : ""}<button type="button" class="link" data-act="cellar">Legg i kjelleren</button>`)).join("");
  if (kind === "menu" && r.skip?.name) h += `<div class="skip rise" style="animation-delay:${picks.length * 50}ms"><span class="eyebrow">Styr unna</span><span>${esc(r.skip.name)}. ${esc(r.skip.why)}</span></div>`;
  if (kind === "buy" && r.tip) h += `<div class="skip rise" style="animation-delay:${picks.length * 50}ms"><span class="eyebrow">Tips</span><span>${esc(r.tip)}</span></div>`;
  if (r.note) h += `<p class="hint" style="margin-top:14px">${esc(r.note)}</p>`;
  if (kind === "buy" && picks.length) h += `<p class="hint" style="margin-top:14px">Forslagene bygger på AI-ens vinkunnskap, ikke på lagerdata. Sjekk at flasken finnes før du drar.</p>`;
  el.innerHTML = h || `<p class="muted">Ingen forslag kom tilbake.</p>`;
  $$("[data-act=log]", el).forEach(b => b.addEventListener("click", () => {
    const p = picks[+b.closest(".pick").dataset.i], sp = styleParts(p.style);
    const vint = (String(p.name).match(/\b(19|20)\d{2}\b/) || [])[0];
    newWine({ name: String(p.name).replace(/\b(19|20)\d{2}\b/, "").replace(/\s{2,}/g, " ").trim(), vintage: vint ? +vint : null, ...sp, price: numOrNull(String(p.price || "").replace(/[^\d.,]/g, "")), where: "restaurant" });
  }));
  $$("[data-act=cellar]", el).forEach(b => b.addEventListener("click", () => {
    const p = picks[+b.closest(".pick").dataset.i];
    setTab("kjeller"); bottleForm({ name: p.name, ...styleParts(p.style), qty: 1 });
  }));
}

/* ================= Kjeller ================= */
function bottleRank(b) {
  if (!(b.qty > 0)) return 3;
  if (b.drinkTo && YEAR >= b.drinkTo) return 0;
  if (b.drinkFrom && YEAR < b.drinkFrom) return 2;
  return 1;
}
function windowText(b) {
  if (!(b.qty > 0)) return "tom";
  if (b.drinkFrom && b.drinkTo) return `${b.drinkFrom}–${String(b.drinkTo).slice(-2)}`;
  if (b.drinkTo) return `–${b.drinkTo}`;
  if (b.drinkFrom) return `fra ${b.drinkFrom}`;
  return "";
}
function renderCellar() {
  openSwipe = null;
  const C = state.cellar, el = $("#cellarBody");
  const bottles = C.reduce((s, b) => s + (b.qty || 0), 0), value = C.reduce((s, b) => s + (b.qty || 0) * (b.price || 0), 0);
  $("#cellarEyebrow").textContent = bottles ? (value ? `Verdi ${kr(value)}` : `${bottles} flasker`) : "Din kjeller";
  if (!C.length) {
    $("#cellarRings").innerHTML = "";
    el.innerHTML = `<div class="empty"><h2>Vinkjelleren er tom</h2><p>Legg inn flaskene du har liggende. Da ser du hva som bør drikkes først, og rådene kan foreslå noe du allerede eier.</p><button class="btn dark" type="button" id="emptyBottle">Legg til en flaske</button></div>`;
    $("#emptyBottle").addEventListener("click", () => bottleForm({}));
    return;
  }
  const counts = [0, 1, 2].map(r => C.filter(b => bottleRank(b) === r).reduce((s, b) => s + b.qty, 0));
  const COLORS = ["var(--accent)", "var(--ink)", "var(--track)"], LABELS = ["drikk snart", "klare", "lagres"];
  const SECTIONS = ["Drikk snart", "Klar", "Lagres", "Tomme"];
  const pend = pendingIds();
  const sorted = [...C].sort((a, b) => bottleRank(a) - bottleRank(b) || (a.drinkTo || 9999) - (b.drinkTo || 9999) || String(a.name).localeCompare(String(b.name), "nb"));
  // To ringer ved tittelen: modning (drikk snart / klare / lagres) og type (rød / hvit / musserende …)
  const TYPE_RING = [["rød", "rød", "var(--wine-red)"], ["hvit", "hvit", "#E3C96B"], ["musserende", "musserende", "#B9AE8E"], ["rosé", "rosé", "#EFA59B"], ["oransje", "oransje", "#D9894A"], ["søt", "søt", "#8F5A17"], ["", "annet", "var(--faint)"]];
  const tcounts = TYPE_RING.map(([t]) => C.filter(b => (TYPES.includes(b.type) ? b.type : "") === t).reduce((s, b) => s + (b.qty || 0), 0));
  const typeShown = TYPE_RING.map((t, i) => [...t, tcounts[i]]).filter((t, i) => tcounts[i] || i < 3);
  $("#cellarRings").innerHTML = bottles ? ring(counts.map((n, i) => [n, COLORS[i]]), bottles) + ring(typeShown.map(t => [t[3], t[2]]), "") : "";
  let html = bottles ? `<div class="dist-legend two" role="img" aria-label="${counts.map((n, i) => `${n} ${LABELS[i]}`).join(", ")}; ${typeShown.map(t => `${t[3]} ${t[1]}`).join(", ")}">
      <div class="ln">${counts.map((n, i) => `<span><i style="background:${COLORS[i]}"></i><b>${n}</b> ${LABELS[i]}</span>`).join("")}</div>
      <div class="ln">${typeShown.map(t => `<span><i style="background:${t[2]}"></i><b>${t[3]}</b> ${t[1]}</span>`).join("")}</div></div>` : "";
  for (let r = 0; r < 4; r++) {
    const items = sorted.filter(b => bottleRank(b) === r); if (!items.length) continue;
    html += `<div class="group"><span class="eyebrow" style="${r === 0 ? "color:var(--accent)" : ""}">${SECTIONS[r]}</span>${items.map(b => swipeRow({
      kind: "bottle", id: b.id,
      lead: `<span class="qty">${b.qty || 0}</span>`,
      title: esc(cleanName(b)),
      sub: `${pend.has(b.id) ? `<i class="pending-dot"></i>` : ""}<span>${listSub(b) || TYPE_LABEL[b.type] || ""}</span>`,
      trail: `<span class="window${r === 0 ? " soon" : ""}">${esc(windowText(b))}</span>`,
      actions: b.qty > 0 ? [{ act: "drink", label: "Drakk", c: "ink" }, { act: "del", label: "Slett", c: "red" }] : [{ act: "del", label: "Slett", c: "red" }],
    })).join("")}</div>`;
  }
  el.innerHTML = html;
}
$("#addBottleBtn").addEventListener("click", () => bottleForm({}));
function ring(segs, center) {
  const R = 20, Cf = 2 * Math.PI * R, tot = segs.reduce((s, [n]) => s + n, 0), parts = segs.filter(([n]) => n > 0);
  const gap = parts.length > 1 ? 2.2 : 0;
  let off = 0, arcs = "";
  for (const [n, col] of parts) {
    const len = Math.max(0.5, (n / tot) * Cf - gap);
    arcs += `<circle cx="23" cy="23" r="${R}" stroke="${col}" stroke-dasharray="${len.toFixed(2)} ${(Cf - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"></circle>`;
    off += (n / tot) * Cf;
  }
  return `<svg class="ring" viewBox="0 0 46 46"><g transform="rotate(-90 23 23)"><circle class="bg" cx="23" cy="23" r="${R}"></circle>${arcs}</g>${center !== "" ? `<text x="23" y="23.5">${center}</text>` : ""}</svg>`;
}
function drinkOne(b) {
  mutate("cellar", "upsert", b.id, { ...b, qty: Math.max(0, (b.qty || 0) - 1) });
  newWine({ name: b.name, producer: b.producer, vintage: b.vintage, type: b.type, grape: b.grape, region: b.region, price: b.price, where: "hjemme" });
  toast("Én flaske mindre i kjelleren");
}
function bottleDetail(b) {
  openDetailRef = { kind: "bottle", id: b.id };
  let qty = b.qty || 0;
  const facts = [["Drikkevindu", windowText(b) || "–"], ["Plassering", b.loc || "–"], ["Pris", b.price ? kr(b.price) : "–"]];
  openSheet({
    title: "", left: "", right: "Ferdig", rightPlain: true,
    html: `
      <div class="d-head"><span class="glass lg" style="background:${glass(b.type)}"></span>
        <div class="stack"><h2>${esc(cleanName(b))}</h2><span class="small muted">${metaOf(b) || "&nbsp;"}</span></div></div>
      <div class="d-score"><div style="display:flex;align-items:baseline;gap:8px"><span class="big" id="bd_qty">${qty}</span><span class="of" id="bd_w">${qty === 1 ? "flaske" : "flasker"}</span></div>
        <div class="stepper"><button type="button" data-a="minus" aria-label="En mindre" ${qty < 1 ? "disabled" : ""}>−</button><button type="button" data-a="plus" aria-label="En til">+</button></div></div>
      <dl class="facts" style="margin:0">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      ${b.notes ? `<section class="fieldset"><h3 class="eyebrow">Notat</h3><p class="quote">${esc(b.notes)}</p></section>` : ""}
      <div class="actions-row"><button type="button" class="btn light" data-a="edit">Rediger</button><button type="button" class="btn dark" data-a="drink" ${qty < 1 ? "disabled" : ""}>Drakk en</button></div>
      <button type="button" class="link danger" data-a="del" style="align-self:flex-start">Fjern fra kjelleren</button>`,
    onClose: () => { openDetailRef = null; },
    mount: body => body.addEventListener("click", e => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      const cur = state.cellar.find(x => x.id === b.id) || b;
      if (a === "plus" || a === "minus") {
        qty = Math.max(0, qty + (a === "plus" ? 1 : -1));
        $("#bd_qty", body).textContent = qty; $("#bd_w", body).textContent = qty === 1 ? "flaske" : "flasker";
        $('[data-a="minus"]', body).disabled = qty < 1; $('[data-a="drink"]', body).disabled = qty < 1;
        mutate("cellar", "upsert", b.id, { ...cur, qty });
      } else if (a === "drink") { closeSheet(); drinkOne({ ...cur, qty }); }
      else if (a === "edit") bottleForm({ ...cur, qty }, b.id);
      else if (a === "del") { closeSheet(); removeWithUndo("bottle", b.id); }
    }),
  });
}
function bottleForm(f, editingId = null) {
  if (state.tab !== "kjeller") setTab("kjeller");
  openSheet({
    title: editingId ? "Rediger flaske" : "Ny flaske", left: "Avbryt", right: "Lagre", rightDisabled: !(f.name || "").trim(),
    html: `
      <div class="fieldset">
        <label class="eyebrow" for="b_name">Vin</label>
        <div class="name-row">
          <input id="b_name" type="text" placeholder="Navn på vinen" autocomplete="off" value="${esc(f.name || "")}">
          <input type="file" id="b_scan" accept="image/*" hidden>
          <label for="b_scan" class="icon-btn ghost" aria-label="Skann etiketten">${CAM}</label>
        </div>
        <p class="scan-status" id="b_scanStatus" hidden></p>
      </div>
      ${typePickerHTML("b_type", f.type || null)}
      <div class="fields">
        <label class="f"><span>Antall</span><input id="b_qty" type="number" inputmode="numeric" min="0" value="${esc(f.qty ?? 1)}"></label>
        <label class="f"><span>Drikk fra</span><input id="b_from" type="number" inputmode="numeric" placeholder="År" value="${esc(f.drinkFrom ?? "")}"></label>
        <label class="f"><span>Drikk til</span><input id="b_to" type="number" inputmode="numeric" placeholder="År" value="${esc(f.drinkTo ?? "")}"></label>
      </div>
      <div class="fields">
        <label class="f"><span>Produsent</span><input id="b_producer" type="text" autocomplete="off" value="${esc(f.producer || "")}"></label>
        <label class="f"><span>Årgang</span><input id="b_vintage" type="number" inputmode="numeric" value="${esc(f.vintage ?? "")}"></label>
        <label class="f"><span>Drue</span><input id="b_grape" type="text" autocomplete="off" value="${esc(f.grape || "")}"></label>
        <label class="f"><span>Region</span><input id="b_region" type="text" autocomplete="off" value="${esc(f.region || "")}"></label>
        <label class="f"><span>Pris</span><input id="b_price" type="number" inputmode="decimal" placeholder="kr per flaske" value="${esc(f.price ?? "")}"></label>
        <label class="f"><span>Plassering</span><input id="b_loc" type="text" placeholder="Hylle B, rad 3" autocomplete="off" value="${esc(f.loc || "")}"></label>
      </div>
      <div class="fieldset"><label class="eyebrow" for="b_notes">Notat</label><div class="note"><textarea id="b_notes" rows="3">${esc(f.notes || "")}</textarea></div></div>
      <p class="hint">Drikkevinduet sorterer kjelleren, så det som bør drikkes snart havner øverst. Skann etiketten for et forslag.</p>`,
    mount: b => {
      const name = $("#b_name", b);
      name.addEventListener("input", () => { $("#sheetRight").disabled = !name.value.trim(); });
      $("#b_scan", b).addEventListener("change", async e => {
        const file = e.target.files[0]; e.target.value = ""; if (!file) return;
        const r = await scanLabel(file, $("#b_scanStatus", b)); if (!r) return;
        const set = (id, v) => { if (v != null && v !== "") $(id, b).value = v; };
        set("#b_name", r.name); set("#b_producer", r.producer); set("#b_vintage", r.vintage); set("#b_grape", r.grape); set("#b_region", r.region); set("#b_from", r.drinkFrom); set("#b_to", r.drinkTo);
        if (TYPES.includes(r.type)) $$("#b_type button", b).forEach(x => x.setAttribute("aria-checked", String(x.dataset.v === r.type)));
        $("#sheetRight").disabled = !name.value.trim();
      });
    },
    onRight: () => {
      const b = sheetBody, name = $("#b_name", b).value.trim(); if (!name) return;
      const existing = editingId ? state.cellar.find(x => x.id === editingId) : null;
      const data = {
        ...(existing || {}), name, type: typeVal($("#b_type", b)), producer: $("#b_producer", b).value.trim(), vintage: numOrNull($("#b_vintage", b).value),
        grape: $("#b_grape", b).value.trim(), region: $("#b_region", b).value.trim(), qty: Math.max(0, Math.round(numOrNull($("#b_qty", b).value) ?? 1)),
        drinkFrom: numOrNull($("#b_from", b).value), drinkTo: numOrNull($("#b_to", b).value), price: numOrNull($("#b_price", b).value),
        loc: $("#b_loc", b).value.trim(), notes: $("#b_notes", b).value.trim(), addedAt: existing?.addedAt || Date.now(),
      };
      mutate("cellar", "upsert", editingId || uuid(), data);
      closeSheet(); toast(editingId ? "Endringene er lagret" : `${name} ligger i kjelleren`);
    },
  });
}

/* ================= Login + boot ================= */
function showLogin(msg) {
  uid = null; state.user = null; state.wines = []; state.cellar = []; outbox = [];
  if (sheetOpen) closeSheet();
  $("#app").hidden = true; $("#login").hidden = false;
  if (msg) { $("#lg_err").textContent = msg; $("#lg_err").hidden = false; }
}
function enterApp(user) {
  if (uid === user.id && !$("#app").hidden) return;
  uid = user.id; state.user = user;
  $("#login").hidden = true; $("#app").hidden = false;
  $("#avatarBtn").textContent = (displayName(user)[0] || "?").toUpperCase();
  const cache = ls.get(K("cache"), null);
  if (cache) { state.wines = cache.wines || []; state.cellar = cache.cellar || []; }
  outbox = ls.get(K("outbox"), []);
  setTab("logg"); renderLog(); renderCellar(); updateSync();
  flush().then(() => loadAll());
}
const toEmail = u => { u = u.trim().toLowerCase(); return u.includes("@") ? u : `${u}@${CFG.userDomain || "vin.raggan.no"}`; };
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const u = $("#lg_user").value.trim(), p = $("#lg_pass").value, err = $("#lg_err"), btn = $("#lg_go");
  err.hidden = true;
  if (!u || !p) { err.textContent = "Fyll inn brukernavn og passord."; err.hidden = false; return; }
  if (!sb) { err.textContent = "Appen er ikke koblet til databasen ennå."; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = "Logger inn …";
  const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(u), password: p });
  btn.disabled = false; btn.textContent = "Logg inn";
  if (error) { err.textContent = !navigator.onLine ? "Ingen nettforbindelse." : /invalid/i.test(error.message) ? "Feil brukernavn eller passord." : "Kunne ikke logge inn. Prøv igjen."; err.hidden = false; return; }
  $("#lg_pass").value = "";
  enterApp(data.user);
});

if ("serviceWorker" in navigator && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

if (!CONFIGURED || !window.supabase?.createClient) {
  showLogin();
  $("#lg_lead").textContent = "Appen er ikke koblet til databasen ennå. Fyll inn config.js.";
  $("#lg_go").disabled = true;
} else {
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "vinprofil-auth" } });
  sb.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (session?.user) enterApp(session.user);
      else if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") showLogin();
    }, 0);
  });
}
})();
