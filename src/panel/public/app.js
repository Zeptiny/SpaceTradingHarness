"use strict";
// Flight Deck — panel client. No build step, no dependencies.
// Views mount a static skeleton once, then update() re-renders only their
// dynamic regions, so inputs keep focus and expanded entries stay open while
// live events stream in over SSE.

// ================================================================ utilities

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isNum = v => typeof v === "number" && Number.isFinite(v);
const nf = new Intl.NumberFormat("en-US");
const fmtInt = n => (isNum(n) ? nf.format(Math.round(n)) : "–");
const fmtCompact = n => {
  if (!isNum(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K`;
  return nf.format(Math.round(n));
};
const fmtSigned = n => (!isNum(n) ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmtInt(Math.abs(n))}`);
const pad2 = n => String(n).padStart(2, "0");
function fmtDur(ms) {
  if (!isNum(ms)) return "–";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad2(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${pad2(m % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function fmtRel(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
const fmtAgo = ts => (!isNum(ts) ? "–" : Date.now() - ts < 5000 ? "just now" : `${fmtRel(Date.now() - ts)} ago`);
function fmtClockDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
  return `${Math.floor(s / 3600)}h ${pad2(Math.floor((s % 3600) / 60))}m`;
}
function fmtCountdown(ts) {
  if (!isNum(ts)) return "–";
  const d = ts - Date.now();
  return d >= 0 ? `in ${fmtClockDur(d)}` : `${fmtClockDur(-d)} overdue`;
}
function fmtTime(ts) {
  if (!isNum(ts)) return "–";
  const d = new Date(ts);
  const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${t}`;
}
const parseTs = v => (typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN);
const wpShort = s => String(s ?? "").split("-").slice(2).join("-") || String(s ?? "");
const title = s => String(s ?? "").replace(/_/g, " ").toLowerCase();

function jsonHtml(v) {
  let s;
  try { s = JSON.stringify(v, null, 2); } catch { s = String(v); }
  if (s === undefined) return '<span class="muted">—</span>';
  return esc(s).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/g, (m, str, colon, bool, n) => {
    if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
    if (bool) return `<span class="b">${bool}</span>`;
    return `<span class="n">${n}</span>`;
  });
}

const ICON = {
  overview: '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>',
  fleet: '<path d="M12 2.5c2.8 2.6 4 5.6 4 9.5v5l-4 3-4-3v-5c0-3.9 1.2-6.9 4-9.5z"/><path d="M8 13l-3.5 2.6V19L8 17.6M16 13l3.5 2.6V19L16 17.6"/><circle cx="12" cy="10" r="1.6"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  map: '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="10" ry="4.4" transform="rotate(-24 12 12)"/><circle cx="20.2" cy="8.2" r="1.1"/>',
  galaxy: '<circle cx="12" cy="12" r="1.8"/><path d="M12 4.5c4.6 0 7.5 3 7.5 6.2 0 2.8-2.3 4.8-5 4.8"/><path d="M12 19.5c-4.6 0-7.5-3-7.5-6.2 0-2.8 2.3-4.8 5-4.8"/><circle cx="19" cy="5" r=".9"/><circle cx="5" cy="19" r=".9"/>',
  markets: '<path d="M3 20h18M6 16v-5M11 16V6M16 16v-8M21 16v-3"/>',
  contracts: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/>',
  memory: '<path d="M6 3h12v18l-6-4-6 4z"/><path d="M10 8h4"/>',
  agent: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
};
const icon = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name] ?? ""}</svg>`;

// Live updates go through patch() instead of innerHTML. Rewriting innerHTML
// rebuilds every node, which replays the `.mount` fade-in on cards, restarts
// CSS transitions and animations, and drops hover state — the panel looks like
// it keeps reloading. patch() skips identical markup and otherwise morphs the
// existing DOM in place, touching only the nodes and attributes that changed.
const lastMarkup = new WeakMap();
const markupParser = document.createElement("template");
function patch(el, html) {
  if (!el || lastMarkup.get(el) === html) return;
  lastMarkup.set(el, html);
  const svg = el instanceof SVGElement;
  markupParser.innerHTML = svg ? `<svg>${html}</svg>` : html;
  morphChildren(el, svg ? markupParser.content.firstChild : markupParser.content);
}
function morphChildren(cur, next) {
  const olds = [...cur.childNodes], news = [...next.childNodes];
  news.forEach((n, i) => {
    const o = olds[i];
    if (!o) cur.appendChild(n);
    else if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) cur.replaceChild(n, o);
    else if (o.nodeType === Node.ELEMENT_NODE) { morphAttrs(o, n); morphChildren(o, n); }
    else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
  });
  for (const o of olds.slice(news.length)) o.remove();
}
function morphAttrs(o, n) {
  for (const { name } of [...o.attributes]) if (!n.hasAttribute(name)) o.removeAttribute(name);
  for (const { name, value } of n.attributes) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
}

function toast(msg, bad = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast${bad ? " bad" : ""}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

// ================================================================ data

const S = {
  state: null, wakes: [], activity: [], wakeLog: new Map(), credits: [],
  markets: [], universe: null, galaxy: null, galaxyAt: 0, memory: null, tools: null, history: new Map(),
};
const UI = {
  view: "overview", conn: "connecting", lastEventAt: 0,
  selWake: null, logQuery: "", logIssues: false, openCalls: new Set(),
  fleetFilter: "", creditRange: 24, lbTab: "credits",
  mapSystem: null, mapSel: null, mapView: null,
  galView: null, galSel: null, galHover: null,
  marketTab: "opps", marketSel: null, marketQuery: "",
  noteKind: "", noteQuery: "", toolQuery: "", openTools: new Set(),
};

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

const selectedWakeId = () => UI.selWake ?? S.state?.wake?.id ?? S.wakes[0]?.wake ?? null;

const LOADERS = {
  state: async () => { S.state = await api("/api/state"); },
  wakes: async () => { S.wakes = await api("/api/summaries?limit=80"); },
  activity: async () => { S.activity = await api("/api/activity?limit=400"); },
  wakeLog: async () => {
    const id = selectedWakeId();
    if (id) S.wakeLog.set(id, await api(`/api/activity?wake=${id}&limit=1000`));
  },
  credits: async () => { S.credits = await api(`/api/credits?since=${Date.now() - 7 * 86_400_000}`); },
  markets: async () => { S.markets = await api("/api/markets"); },
  universe: async () => { S.universe = await api("/api/universe"); },
  // The system list is big and fixed per reset: fetch it once, and while the
  // collector is still filling it, at most every 30s.
  galaxy: async () => {
    if (S.galaxy?.complete || Date.now() - S.galaxyAt < 30_000) return;
    S.galaxyAt = Date.now();
    S.galaxy = await api("/api/galaxy");
  },
  memory: async () => { S.memory = await api("/api/memory"); },
  tools: async () => { if (!S.tools) S.tools = await api("/api/tools"); },
  history: async () => {
    if (!UI.marketSel) return;
    S.history.set(UI.marketSel, await api(`/api/markets/history?waypoint=${encodeURIComponent(UI.marketSel)}&limit=40`));
  },
};
const ALWAYS = ["state", "wakes"];

// Core resources load first: view loaders (e.g. wakeLog picks the wake to
// fetch from state/wakes) may depend on them.
async function load(names) {
  const run = list => Promise.all(list.map(n => LOADERS[n]().catch(err => console.warn(`[panel] load ${n} failed`, err))));
  const set = new Set(names);
  await run(ALWAYS.filter(n => set.has(n)));
  await run([...set].filter(n => !ALWAYS.includes(n)));
}

// Every API call the agent makes emits an event, so during a wake they arrive
// continuously. Batch them into at most one reload per FLUSH_MS, and hold them
// while the browser tab is hidden (flushed as soon as it is visible again).
const FLUSH_MS = 1000;
const dirty = new Set();
let flushTimer = null;
function invalidate(names) {
  const needs = new Set([...ALWAYS, ...(VIEWS[UI.view]?.needs ?? [])]);
  for (const n of names) if (needs.has(n)) dirty.add(n);
  if (dirty.size && !flushTimer && !document.hidden) flushTimer = setTimeout(flush, FLUSH_MS);
}
document.addEventListener("visibilitychange", () => invalidate([]));
async function flush() {
  flushTimer = null;
  const names = [...dirty];
  dirty.clear();
  await load(names);
  renderChrome();
  VIEWS[UI.view]?.update();
}

// ================================================================ derived data

const ships = () => S.state?.fleet ?? [];
const contracts = () => S.state?.contracts ?? [];
const creditsNow = () => S.state?.agent?.credits ?? S.credits.at(-1)?.credits ?? null;
function creditsAt(ts) {
  let v = null;
  for (const p of S.credits) { if (p.ts <= ts) v = p.credits; else break; }
  return v ?? S.credits[0]?.credits ?? null;
}
const isOpenContract = c => !c.fulfilled && !c.expired;
const contractDeadline = c => parseTs(c.accepted ? c.deadline : (c.deadlineToAccept ?? c.expiration));
const arrivedStale = s => s.nav?.status === "IN_TRANSIT" && s.nav.route && parseTs(s.nav.route.arrival) < Date.now();
const issuesOf = w => (w.actions ?? []).filter(a => a.outcome !== "ok").length;
const wakeDelta = w => (isNum(w.stats?.creditsStart) && isNum(w.stats?.creditsEnd) ? w.stats.creditsEnd - w.stats.creditsStart : null);

function lastShipAction(symbol) {
  for (let i = S.activity.length - 1; i >= 0; i--) {
    const e = S.activity[i];
    if (e.kind === "tool" && e.args?.shipSymbol === symbol && e.tool !== "get_ship") return e;
  }
  return null;
}

function alerts() {
  const out = [];
  const st = S.state;
  if (!st) return out;
  if (st.config?.policy === "readonly") out.push({ lvl: "info", text: "Read-only policy", sub: "AGENT_POLICY=readonly blocks every mutating tool." });
  if (st.scheduler?.paused) out.push({ lvl: "warn", text: "Agent is paused", sub: "Resume from the top bar; manual wakes still run." });
  if (st.llm?.lastError && st.llm.errors > 0) out.push({ lvl: "bad", text: `LLM errors: ${st.llm.errors}`, sub: st.llm.lastError });
  const last = S.wakes[0];
  if (last?.stats && ["llm-error", "error"].includes(last.stats.endedBy)) out.push({ lvl: "bad", text: `Wake #${last.wake} ended by ${last.stats.endedBy}`, sub: last.text, href: `#/activity/${last.wake}` });
  if (last && issuesOf(last) >= 3) out.push({ lvl: "warn", text: `Wake #${last.wake}: ${issuesOf(last)} failed calls`, sub: "Guards or the API rejected several actions.", href: `#/activity/${last.wake}` });
  for (const s of ships()) {
    const cap = s.fuel?.capacity ?? 0;
    if (cap > 0 && s.fuel.current / cap < 0.2) out.push({ lvl: s.fuel.current / cap < 0.08 ? "bad" : "warn", text: `${s.symbol} low on fuel`, sub: `${fmtInt(s.fuel.current)}/${fmtInt(cap)} at ${wpShort(s.nav?.waypoint)}` });
    if (s.cargo?.capacity > 0 && s.cargo.units >= s.cargo.capacity && s.nav?.status !== "IN_TRANSIT") out.push({ lvl: "info", text: `${s.symbol} cargo full`, sub: `${s.cargo.units}/${s.cargo.capacity} at ${wpShort(s.nav?.waypoint)}` });
  }
  for (const c of contracts().filter(isOpenContract)) {
    const dl = contractDeadline(c);
    if (isNum(dl) && dl - Date.now() < 24 * 3600_000) out.push({ lvl: dl - Date.now() < 3 * 3600_000 ? "bad" : "warn", text: c.accepted ? `Contract due ${fmtCountdown(dl)}` : `Offer expires ${fmtCountdown(dl)}`, sub: `${c.type.toLowerCase()} · ${c.deliverables.map(d => `${d.symbol} ${d.fulfilled}/${d.required}`).join(", ")}`, href: "#/contracts" });
  }
  return out;
}

// ================================================================ charts

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function creditsChart(host, points, fromTs) {
  const w = Math.max(320, host.clientWidth);
  // Redraw only when the data, range or size changed (or the time axis has
  // moved a minute), so the chart doesn't repaint on every live event.
  const key = `${w}|${Math.round((Date.now() - fromTs) / 60_000)}|${points.length}|${points.at(-1)?.ts}|${points.at(-1)?.credits}|${Math.floor(Date.now() / 60_000)}`;
  if (host.dataset.key === key) return;
  host.dataset.key = key;
  const h = 210;
  const pad = { l: 58, r: 14, t: 10, b: 26 };
  const before = points.filter(p => p.ts < fromTs).at(-1);
  const pts = [...(before ? [{ ts: fromTs, credits: before.credits }] : []), ...points.filter(p => p.ts >= fromTs)];
  if (pts.length < 2) {
    host.innerHTML = '<div class="empty">Not enough credit history yet — it fills as the agent refreshes and trades.</div>';
    return;
  }
  const x0 = pts[0].ts, x1 = Date.now();
  const vals = pts.map(p => p.credits);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || Math.max(1000, hi * 0.05);
  lo -= span * 0.15; hi += span * 0.15;
  const step = niceStep((hi - lo) / 4);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const X = t => pad.l + ((t - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const Y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  // Balances change in steps, so draw a step-after line — it never implies
  // a gradual change between two observations.
  let d = `M${X(pts[0].ts).toFixed(1)},${Y(pts[0].credits).toFixed(1)}`;
  for (const p of pts.slice(1)) d += `H${X(p.ts).toFixed(1)}V${Y(p.credits).toFixed(1)}`;
  d += `H${X(x1).toFixed(1)}`;
  const area = `${d}V${Y(lo).toFixed(1)}H${X(x0).toFixed(1)}Z`;
  const xt = [];
  for (let i = 0; i <= 4; i++) xt.push(x0 + ((x1 - x0) * i) / 4);
  const last = pts.at(-1);
  host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" height="${h}" role="img" aria-label="Credits over time, currently ${esc(fmtInt(last.credits))}">
    ${ticks.map(v => `<line class="gridline" x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="axis" x="${pad.l - 8}" y="${Y(v) + 3.5}" text-anchor="end">${esc(fmtCompact(v))}</text>`).join("")}
    ${xt.map((t, i) => `<text class="axis" x="${X(t)}" y="${h - 6}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${esc(fmtTime(t))}</text>`).join("")}
    <path class="area" d="${area}"/>
    <path class="line" d="${d}"/>
    <circle class="end-dot" cx="${X(x1)}" cy="${Y(last.credits)}" r="4.5"/>
    <line class="crosshair" x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}" visibility="hidden"/>
    <circle class="end-dot hover-dot" r="4.5" visibility="hidden"/>
    <rect class="hit" x="${pad.l}" y="0" width="${w - pad.l - pad.r}" height="${h}"/>
  </svg>`;
  const svg = host.querySelector("svg");
  const hair = svg.querySelector(".crosshair"), dot = svg.querySelector(".hover-dot"), hit = svg.querySelector(".hit");
  const tip = $("#tooltip");
  const move = ev => {
    const r = svg.getBoundingClientRect();
    const t = x0 + ((((ev.clientX - r.left) * w) / r.width - pad.l) / (w - pad.l - pad.r)) * (x1 - x0);
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.ts - t) < Math.abs(best.ts - t)) best = p;
    const bx = X(best.ts), by = Y(best.credits);
    hair.setAttribute("x1", bx); hair.setAttribute("x2", bx); hair.setAttribute("visibility", "visible");
    dot.setAttribute("cx", bx); dot.setAttribute("cy", by); dot.setAttribute("visibility", "visible");
    tip.innerHTML = `<strong>${esc(fmtInt(best.credits))} cr</strong>${esc(new Date(best.ts).toLocaleString())}`;
    tip.hidden = false;
    const px = r.left + (bx / w) * r.width;
    tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, px + 12)}px`;
    tip.style.top = `${r.top + (by / h) * r.height - tip.offsetHeight - 10}px`;
  };
  const leave = () => { hair.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerleave", leave);
}

function spark(values, w = 88, h = 22) {
  const v = values.filter(isNum);
  if (v.length < 2) return '<span class="muted">—</span>';
  const lo = Math.min(...v), hi = Math.max(...v), rng = hi - lo || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * (w - 4) + 2, h - 3 - ((x - lo) / rng) * (h - 6)]);
  const [lx, ly] = pts.at(-1);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${v.length} reads, ${fmtInt(lo)}–${fmtInt(hi)}"><title>${v.length} reads · low ${esc(fmtInt(lo))} · high ${esc(fmtInt(hi))} · last ${esc(fmtInt(v.at(-1)))}</title><polyline class="s-line" points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}"/><circle class="s-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6"/></svg>`;
}

// ================================================================ shared fragments

const statusBadge = st => `<span class="badge st-${esc(st)}">${esc(title(st))}</span>`;
function gauge(label, cur, cap, kind = "") {
  if (!(cap > 0)) return `<div class="gauge"><span class="gauge-label">${esc(label)}</span><span class="muted" style="font-size:12px">none</span><span></span></div>`;
  const pct = Math.max(0, Math.min(100, (cur / cap) * 100));
  const lvl = kind === "fuel" ? (pct < 10 ? " bad" : pct < 25 ? " warn" : "") : "";
  return `<div class="gauge"><span class="gauge-label">${esc(label)}</span><span class="gauge-track"><i class="${kind}${lvl}" style="width:${pct.toFixed(1)}%"></i></span><span class="gauge-num">${esc(fmtInt(cur))} / ${esc(fmtInt(cap))}</span></div>`;
}
const SUPPLY = { SCARCE: 1, LIMITED: 2, MODERATE: 3, HIGH: 4, ABUNDANT: 5 };
const supplyPips = s => `<span class="supply" title="supply: ${esc(s ?? "unknown")}"><span class="pips">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= (SUPPLY[s] ?? 0) ? "on" : ""}"></i>`).join("")}</span>${esc(title(s ?? ""))}</span>`;
const empty = (msg, hint = "") => `<div class="empty">${msg}${hint ? `<br><span class="muted">${hint}</span>` : ""}</div>`;
const panel = (titleText, body, { aside = "", cls = "", id = "", bodyCls = "panel-body" } = {}) =>
  `<section class="panel ${cls}"${id ? ` id="${id}"` : ""}><header class="panel-head"><h2 class="panel-title">${titleText}</h2>${aside ? `<div class="panel-aside">${aside}</div>` : ""}</header><div class="${bodyCls}">${body}</div></section>`;

function argsBrief(args) {
  if (!args || typeof args !== "object") return "";
  return Object.entries(args)
    .filter(([k]) => k !== "summary")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ")
    .slice(0, 140);
}

function outcomeClass(o) {
  if (!o || o === "ok") return "ok";
  if (o === "guard-rejected" || o === "blocked-by-policy") return "rejected";
  return "error";
}

function wakeStatsTags(w) {
  const st = w.stats;
  if (!st) return "";
  const delta = wakeDelta(w);
  const tok = st.tokens ? st.tokens.prompt + st.tokens.completion : null;
  return [
    `<span class="tag small">${esc(fmtDur(st.durationMs))}</span>`,
    `<span class="tag small">${esc(st.rounds)} rounds</span>`,
    `<span class="tag small">${esc(st.requests)} req</span>`,
    tok != null ? `<span class="tag small">${esc(fmtCompact(tok))} tok</span>` : "",
    delta != null && delta !== 0 ? `<span class="tag small"><b class="${delta > 0 ? "good" : "bad"}">${esc(fmtSigned(delta))}</b> cr</span>` : "",
    st.endedBy && st.endedBy !== "end_loop" ? `<span class="badge b-warn plain">${esc(st.endedBy)}</span>` : "",
  ].join("");
}

// ================================================================ chrome

const NAV = [
  ["overview", "Overview"], ["fleet", "Fleet"], ["activity", "Activity"], ["galaxy", "Galaxy"], ["map", "System"],
  ["markets", "Markets"], ["contracts", "Contracts"], ["memory", "Memory"], ["agent", "Agent"],
];

function renderChrome() {
  const st = S.state;
  // nav
  const running = !!st?.wake;
  const lastIssues = S.wakes[0] ? issuesOf(S.wakes[0]) : 0;
  const counts = {
    fleet: st ? `<span class="count">${ships().length}</span>` : "",
    activity: running ? '<span class="count" style="background:var(--accent-wash);color:var(--accent)">live</span>' : lastIssues ? `<span class="count alert" title="failed calls in the last wake">${lastIssues}</span>` : "",
    contracts: st ? (n => (n ? `<span class="count">${n}</span>` : ""))(contracts().filter(c => c.accepted && isOpenContract(c)).length) : "",
    memory: S.memory ? `<span class="count">${S.memory.goals.filter(g => g.status === "active").length}</span>` : "",
  };
  patch($("#nav"), NAV.map(([id, label]) =>
    `<a href="#/${id}"${UI.view === id ? ' aria-current="page"' : ""}>${icon(id)}<span class="lbl">${label}</span>${counts[id] ?? ""}</a>`).join(""));

  // identity + meta
  if (st?.agent) $("#agentIdent").textContent = `${st.agent.symbol} · ${st.agent.headquarters}`;
  if (st) {
    patch($("#railMeta"), `model <b>${esc(st.config.model)}</b><br>policy <b class="${st.config.policy === "readonly" ? "warn" : ""}">${esc(st.config.policy)}</b><br>requests <b>${esc(fmtInt(st.requestsTotal))}</b> · up <b data-elapsed="${st.startedAt}">${esc(fmtDur(Date.now() - st.startedAt))}</b>`);
  }

  // status strip
  const strip = $("#strip");
  let mode = "idle", head = "Standing by", sub = "";
  if (UI.conn === "lost") { mode = "lost"; head = "Link lost"; sub = "reconnecting to the harness…"; }
  else if (!st) { mode = "lost"; head = "Connecting"; sub = "waiting for harness…"; }
  else if (st.wake) {
    mode = "running";
    head = `Executing · wake #${st.wake.id}`;
    sub = `round ${st.wake.round} · ${esc(st.wake.reason)} · <span data-elapsed="${st.wake.startedAt}">${esc(fmtDur(Date.now() - st.wake.startedAt))}</span>`;
  } else if (st.scheduler.paused) {
    mode = "paused"; head = "Paused";
    sub = `agent will not wake until resumed · ${st.scheduler.pending.length} wakeup(s) held`;
  } else {
    const next = st.scheduler.pending[0];
    sub = next ? `next wake <b data-cd="${next.at}">${esc(fmtCountdown(next.at))}</b> · ${esc(next.reason)}` : "no wakeups scheduled";
  }
  strip.dataset.mode = mode;
  $("#statusTitle").textContent = head;
  patch($("#statusSub"), sub);

  const cr = creditsNow();
  $("#stripCredits").textContent = cr == null ? "–" : `${fmtInt(cr)} cr`;
  const base = creditsAt(Date.now() - 24 * 3600_000);
  const delta = cr != null && base != null ? cr - base : null;
  const dEl = $("#stripDelta");
  dEl.className = `figure-delta delta ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`;
  dEl.textContent = delta == null ? "" : `${delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} ${fmtCompact(Math.abs(delta))} 24h`;
  renderRate();
  if (st) {
    const t = st.llm.promptTokens + st.llm.completionTokens;
    $("#stripTokens").textContent = `${fmtCompact(t)} · ${fmtInt(st.llm.calls)} calls`;
    const paused = st.scheduler.paused;
    const b = $("#btnPause");
    b.textContent = paused ? "Resume" : "Pause";
    b.dataset.state = paused ? "paused" : "running";
  }
}

function renderRate() {
  const r = S.state?.rate;
  const fill = $("#rateMeter > i");
  if (r?.limit && r.remaining != null) {
    const pct = Math.max(0, Math.min(100, (r.remaining / r.limit) * 100));
    fill.style.width = `${pct}%`;
    fill.style.background = pct < 25 ? "var(--bad)" : pct < 55 ? "var(--warn)" : "var(--good)";
    $("#rateText").textContent = `${r.remaining}/${r.limit}`;
  } else {
    $("#rateText").textContent = "no data";
  }
}

// ================================================================ views

const view = () => $("#view");
const head = (t, desc, tools = "") => `<div class="view-head"><div><h1 class="view-title">${t}</h1>${desc ? `<p class="view-desc">${desc}</p>` : ""}</div>${tools ? `<div class="view-tools">${tools}</div>` : ""}</div>`;

const VIEWS = {};

// ---------------------------------------------------------------- overview
VIEWS.overview = {
  needs: ["credits", "activity"],
  mount() {
    view().innerHTML = head("Overview", "What the agent is doing, and whether everything is fine.") + `
      <div class="grid g-overview mount">
        <section class="panel span-3 tile" id="tFleet"></section>
        <section class="panel span-3 tile" id="tContracts"></section>
        <section class="panel span-3 tile" id="tWakes"></section>
        <section class="panel span-3 tile" id="tLlm"></section>
        ${panel("Credits", '<div id="creditHero"></div><div class="chart" id="creditChart"></div>', { cls: "span-8", aside: '<div class="chips" id="rangeChips"></div>' })}
        ${panel("Agent · now", '<div class="now-card" id="nowBody"></div>', { cls: "span-4", aside: '<span id="nowAside"></span>' })}
        ${panel("Fleet", '<div class="table-wrap" id="miniFleet"></div>', { cls: "span-8", bodyCls: "panel-body flush", aside: '<a href="#/fleet">all ships →</a>' })}
        ${panel("Alerts", '<div class="alerts" id="alertList"></div>', { cls: "span-4" })}
        ${panel("Recent wakes", '<div class="wake-list" id="wakeList"></div>', { cls: "span-8", bodyCls: "panel-body flush", aside: '<a href="#/activity">full log →</a>' })}
        ${panel("Leaderboard", '<div id="leaderboard"></div>', { cls: "span-4", bodyCls: "panel-body flush", aside: '<div class="chips" id="lbChips"></div>' })}
      </div>`;
  },
  update() {
    const st = S.state;
    if (!st) return;
    const fl = ships();
    const by = k => fl.filter(s => s.nav?.status === k).length;
    const segs = [["IN_TRANSIT", "var(--accent)"], ["IN_ORBIT", "var(--cyan)"], ["DOCKED", "var(--blue)"]];
    patch($("#tFleet"), `<span class="tile-label">Fleet</span><span class="tile-value">${fl.length}<small>ships</small></span>
      <div class="segbar">${segs.map(([k, c]) => (by(k) ? `<i style="flex:${by(k)};background:${c}"></i>` : "")).join("")}</div>
      <div class="legend-dots">${segs.map(([k, c]) => `<span><i style="background:${c}"></i>${by(k)} ${title(k)}</span>`).join("")}</div>`);

    const open = contracts().filter(c => c.accepted && isOpenContract(c));
    const offers = contracts().filter(c => !c.accepted && isOpenContract(c));
    const payout = open.reduce((a, c) => a + (c.payment?.onFulfilled ?? 0), 0);
    const soonest = open.map(contractDeadline).filter(isNum).sort((a, b) => a - b)[0];
    patch($("#tContracts"), `<span class="tile-label">Active contracts</span><span class="tile-value">${open.length}${offers.length ? `<small>+${offers.length} offered</small>` : ""}</span>
      <div class="tile-foot">${payout ? `<span><b class="good">${esc(fmtCompact(payout))}</b> on fulfil</span>` : '<span class="muted">nothing pending</span>'}${soonest ? `<span class="sep">|</span><span>due <b data-cd="${soonest}">${esc(fmtCountdown(soonest))}</b></span>` : ""}</div>`);

    const day = S.wakes.filter(w => w.ts > Date.now() - 86_400_000);
    const avg = day.length ? day.reduce((a, w) => a + (w.stats?.durationMs ?? 0), 0) / day.length : null;
    const failed = day.reduce((a, w) => a + issuesOf(w), 0);
    patch($("#tWakes"), `<span class="tile-label">Wakes · 24h</span><span class="tile-value">${day.length}</span>
      <div class="tile-foot"><span>avg ${esc(fmtDur(avg))}</span><span class="sep">|</span><span class="${failed ? "warn" : ""}">${failed} failed call${failed === 1 ? "" : "s"}</span></div>`);

    const llm = st.llm;
    patch($("#tLlm"), `<span class="tile-label">LLM usage · session</span><span class="tile-value">${esc(fmtCompact(llm.promptTokens + llm.completionTokens))}<small>tokens</small></span>
      <div class="tile-foot"><span>${fmtInt(llm.calls)} calls</span><span class="sep">|</span><span>${llm.promptTokens ? Math.round((llm.cachedTokens / llm.promptTokens) * 100) : 0}% cached</span>${llm.errors ? `<span class="sep">|</span><span class="bad">${llm.errors} errors</span>` : ""}</div>`);

    // credits
    patch($("#rangeChips"), [24, 48, 168].map(h => `<button class="chip-btn" data-act="range" data-h="${h}" aria-pressed="${UI.creditRange === h}">${h === 168 ? "7d" : `${h}h`}</button>`).join(""));
    const from = Date.now() - UI.creditRange * 3600_000;
    const cr = creditsNow();
    const base = creditsAt(from);
    const dlt = cr != null && base != null ? cr - base : null;
    patch($("#creditHero"), `<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:8px"><span class="hero-value">${esc(fmtInt(cr))}</span><span class="muted">credits</span>${dlt != null ? `<span class="delta ${dlt > 0 ? "up" : dlt < 0 ? "down" : "flat"}">${dlt > 0 ? "▲" : dlt < 0 ? "▼" : "•"} ${esc(fmtSigned(dlt))} over ${UI.creditRange === 168 ? "7d" : `${UI.creditRange}h`}</span>` : ""}</div>`);
    creditsChart($("#creditChart"), S.credits, from);

    // now
    const nowBody = $("#nowBody");
    if (st.wake) {
      const wakeEntries = S.activity.filter(e => e.wake === st.wake.id);
      const lastThought = [...wakeEntries].reverse().find(e => e.kind === "thought" && e.text);
      const after = lastThought ? wakeEntries.filter(e => e.kind === "tool" && e.id > lastThought.id) : [];
      patch($("#nowAside"), `<span class="badge b-accent">round ${st.wake.round}</span>`);
      patch(nowBody, `<div class="muted" style="font-size:12px">wake #${st.wake.id} · ${esc(st.wake.reason)}</div>
        <p class="thought live">${esc(lastThought?.text ?? "Reading working memory…")}</p>
        <div class="calls">${after.map(e => `<div class="call-line"><span class="ev-dot" style="position:static;box-shadow:none;background:var(--${outcomeClass(e.outcome) === "ok" ? "good" : outcomeClass(e.outcome) === "rejected" ? "warn" : "bad"});width:7px;height:7px;flex:none;border-radius:50%"></span><span class="mono">${esc(e.tool)}</span><span class="args">${esc(e.summary ?? argsBrief(e.args))}</span></div>`).join("")}</div>
        <a href="#/activity/${st.wake.id}" style="font-size:12.5px">follow the transcript →</a>`);
    } else {
      const w = S.wakes[0];
      const next = st.scheduler.pending[0];
      patch($("#nowAside"), st.scheduler.paused ? '<span class="badge b-warn">paused</span>' : '<span class="badge b-good">standing by</span>');
      patch(nowBody, `${w ? `<div class="muted" style="font-size:12px">last wake #${w.wake} · <span data-ago="${w.ts}">${esc(fmtAgo(w.ts))}</span></div><p class="thought">${esc(w.text)}</p><div class="statline">${wakeStatsTags(w)}</div>` : empty("No wakes yet.")}
        ${next ? `<div class="call-line" style="margin-top:4px"><span class="muted">next</span><b class="mono" data-cd="${next.at}">${esc(fmtCountdown(next.at))}</b><span class="args" style="font-family:var(--font-body);font-size:12.5px">${esc(next.reason)}</span></div>` : ""}`);
    }

    // mini fleet
    patch($("#miniFleet"), fl.length ? `<table class="table mini-fleet"><thead><tr><th>Ship</th><th>Status</th><th>Where</th><th>Fuel</th><th>Cargo</th><th class="r">Next</th></tr></thead><tbody>${fl.map(s => {
      const t = s.nav?.route;
      const where = t ? `<span class="mono">${esc(wpShort(t.from))} → ${esc(wpShort(t.to))}</span>` : `<span class="mono">${esc(wpShort(s.nav?.waypoint))}</span>`;
      const cdAt = s.cooldown?.expiration ? parseTs(s.cooldown.expiration) : NaN;
      const nxt = t && !arrivedStale(s) ? `<span class="mono" data-cd="${parseTs(t.arrival)}">${esc(fmtCountdown(parseTs(t.arrival)))}</span>`
        : cdAt > Date.now() ? `<span class="mono muted">cooldown <span data-cd="${cdAt}" data-ready="ready">${esc(fmtCountdown(cdAt))}</span></span>` : '<span class="muted">—</span>';
      const fuelPct = s.fuel?.capacity ? (s.fuel.current / s.fuel.capacity) * 100 : null;
      return `<tr class="clickable" data-act="goto" data-href="#/fleet"><td>${esc(s.symbol)}<div class="muted" style="font-size:11px">${esc(title(s.role))}</div></td><td>${statusBadge(s.nav?.status)}</td><td>${where}</td>
        <td class="num ${fuelPct != null && fuelPct < 20 ? "warn" : ""}">${fuelPct == null ? '<span class="muted">—</span>' : `${Math.round(fuelPct)}%`}</td>
        <td class="num">${s.cargo?.capacity ? `${s.cargo.units}/${s.cargo.capacity}` : '<span class="muted">—</span>'}</td><td class="r">${nxt}</td></tr>`;
    }).join("")}</tbody></table>` : empty("No ships cached yet.", "The fleet appears after the agent's first wake."));

    // alerts
    const al = alerts();
    patch($("#alertList"), al.length ? al.map(a => `<div class="alert ${a.lvl}">${icon(a.lvl === "info" ? "info" : "warn")}<div>${a.href ? `<a href="${esc(a.href)}" style="color:inherit">${esc(a.text)}</a>` : esc(a.text)}${a.sub ? `<div class="alert-sub">${esc(a.sub)}</div>` : ""}</div></div>`).join("")
      : `<div class="alert info">${icon("info")}<div>All clear<div class="alert-sub">No low fuel, deadlines or failing wakes.</div></div></div>`);

    renderLeaderboard();

    // wakes
    patch($("#wakeList"), S.wakes.slice(0, 8).map(w => {
      const delta = wakeDelta(w);
      const iss = issuesOf(w);
      return `<a class="wake-row" href="#/activity/${w.wake}"><div class="wake-id">#${w.wake}<small>${esc(fmtTime(w.ts))}</small></div>
        <div style="min-width:0"><div class="wake-text">${esc(w.text)}</div><div class="wake-reason">${esc(w.reason)}</div></div>
        <div class="wake-stats">${delta ? `<span class="${delta > 0 ? "good" : "bad"}">${esc(fmtSigned(delta))} cr</span>` : ""}<span>${esc(fmtDur(w.stats?.durationMs))}${w.stats ? ` · ${w.stats.requests} req` : ""}</span>${iss ? `<span class="warn">${iss} failed</span>` : ""}</div></a>`;
    }).join("") || empty("No wakes yet."));
  },
};

// Server leaderboards from GET / (the harness re-reads it every ~15 min).
// Shown to the operator only; the agent never sees it.
function renderLeaderboard() {
  const lb = S.state?.server?.leaderboards;
  const me = S.state?.agent?.symbol ?? null;
  const tabs = [["credits", "Credits"], ["charts", "Charts"]];
  patch($("#lbChips"), tabs.map(([k, l]) => `<button class="chip-btn" data-act="lb-tab" data-k="${k}" aria-pressed="${UI.lbTab === k}">${l}</button>`).join(""));
  if (!lb) {
    patch($("#leaderboard"), empty("No leaderboard yet.", "It is read from the server status while the agent sleeps."));
    return;
  }
  const credits = UI.lbTab === "credits";
  const rows = credits
    ? (lb.mostCredits ?? []).map(r => ({ agent: r.agentSymbol, value: r.credits }))
    : (lb.mostSubmittedCharts ?? []).map(r => ({ agent: r.agentSymbol, value: r.chartCount }));
  const rank = rows.findIndex(r => r.agent === me);
  let foot = "";
  if (me && rank < 0) {
    const last = rows.at(-1);
    const mine = credits ? creditsNow() : null;
    foot = `<div class="lb-foot"><span class="mono">${esc(me)}</span> is outside the top ${rows.length}${credits && isNum(mine) && last ? ` · <b>${esc(fmtCompact(last.value - mine))}</b> credits short of #${rows.length}` : ""}</div>`;
  } else if (rank >= 0) {
    foot = `<div class="lb-foot">You are <b>#${rank + 1}</b>${rank > 0 ? ` · ${esc(fmtCompact(rows[rank - 1].value - rows[rank].value))} behind #${rank}` : ""}</div>`;
  }
  patch($("#leaderboard"), rows.length ? `<table class="table lb"><tbody>${rows.map((r, i) => `<tr class="${r.agent === me ? "me" : ""}"><td class="num muted">${i + 1}</td><td class="mono">${esc(r.agent)}</td><td class="num r">${esc(credits ? fmtCompact(r.value) : fmtInt(r.value))}</td></tr>`).join("")}</tbody></table>${foot}` : empty("The leaderboard is empty."));
}

// ---------------------------------------------------------------- fleet
VIEWS.fleet = {
  needs: ["activity"],
  mount() {
    view().innerHTML = head("Fleet", "Every ship's position, route, fuel, cargo and last action.", '<div class="chips" id="fleetChips"></div>') + '<div class="ships mount" id="ships"></div>';
  },
  update() {
    const fl = ships();
    const counts = { "": fl.length };
    for (const s of fl) counts[s.nav?.status] = (counts[s.nav?.status] ?? 0) + 1;
    patch($("#fleetChips"), [["", "All"], ["IN_TRANSIT", "In transit"], ["IN_ORBIT", "In orbit"], ["DOCKED", "Docked"]]
      .map(([k, l]) => `<button class="chip-btn" data-act="fleet-filter" data-k="${k}" aria-pressed="${UI.fleetFilter === k}">${l} <span class="muted">${counts[k] ?? 0}</span></button>`).join(""));
    const list = fl.filter(s => !UI.fleetFilter || s.nav?.status === UI.fleetFilter);
    patch($("#ships"), list.map(s => {
      const r = s.nav?.route;
      const dep = r ? parseTs(r.departed) : NaN, arr = r ? parseTs(r.arrival) : NaN;
      const pct = r ? Math.max(0, Math.min(100, ((Date.now() - dep) / (arr - dep || 1)) * 100)) : 0;
      const loc = r
        ? `<div class="route"><div class="route-ends"><span>${esc(wpShort(r.from))}</span><span class="arrow"></span><span>${esc(wpShort(r.to))}</span></div>
            <div class="route-track"><i data-prog-from="${dep}" data-prog-to="${arr}" style="width:${pct.toFixed(1)}%"></i></div>
            <div class="route-meta"><span>${esc(title(s.nav.flightMode))}</span>${arrivedStale(s) ? '<span class="dim">arrived · awaiting refresh</span>' : `<span>arrives <b class="mono" data-cd="${arr}">${esc(fmtCountdown(arr))}</b></span>`}</div></div>`
        : `<div class="ship-loc">at <span class="wp">${esc(s.nav?.waypoint)}</span><span class="muted">· ${esc(title(s.nav?.flightMode))}</span></div>`;
      const cd = s.cooldown?.expiration ? parseTs(s.cooldown.expiration) : null;
      const last = lastShipAction(s.symbol);
      return `<article class="panel ship">
        <div class="ship-head"><div><div class="ship-name">${esc(s.symbol)}</div><div class="ship-role">${esc(title(s.role))} · ${esc(title(String(s.frame ?? "").replace("FRAME_", "")))}${s.speed ? ` · speed ${esc(s.speed)}` : ""}</div></div>${statusBadge(s.nav?.status)}</div>
        ${loc}
        <div class="ship-gauges">${gauge("Fuel", s.fuel?.current ?? 0, s.fuel?.capacity ?? 0, "fuel")}${gauge("Cargo", s.cargo?.units ?? 0, s.cargo?.capacity ?? 0)}
          ${cd && cd > Date.now() ? `<div class="gauge"><span class="gauge-label">Cooldown</span><span class="dim" style="font-size:12px">reactor recharging</span><span class="gauge-num" data-cd="${cd}" data-ready="ready">${esc(fmtCountdown(cd))}</span></div>` : ""}</div>
        ${s.cargo?.inventory?.length ? `<div class="inv">${s.cargo.inventory.map(i => `<span class="tag">${esc(i.symbol)} <b>${esc(i.units)}</b></span>`).join("")}</div>` : ""}
        <div class="ship-foot">
          ${last ? `<div class="ship-last"><span class="muted nowrap" data-ago="${last.ts}">${esc(fmtAgo(last.ts))}</span><span class="${outcomeClass(last.outcome) === "ok" ? "" : outcomeClass(last.outcome) === "rejected" ? "warn" : "bad"}" title="${esc(last.summary ?? "")}">${esc(last.summary ?? last.tool)}</span></div>` : '<div class="muted">no recent actions</div>'}
          ${[...(s.mounts ?? []), ...(s.modules ?? [])].length ? `<div class="kit">${[...(s.mounts ?? []), ...(s.modules ?? [])].map(m => `<span class="tag small">${esc(m.replace(/^(MOUNT|MODULE)_/, "").replace(/_/g, " ").toLowerCase())}</span>`).join("")}</div>` : ""}
        </div></article>`;
    }).join("") || empty(fl.length ? "No ships match this filter." : "No ships cached yet.", fl.length ? "" : "The fleet appears after the agent's first wake."));
  },
};

// ---------------------------------------------------------------- activity
VIEWS.activity = {
  needs: ["wakeLog", "activity"],
  mount() {
    view().innerHTML = head("Activity", "Every wake as a transcript: the agent's reasoning, each tool call, and what came back.",
      `<input class="field" id="logQuery" placeholder="Filter calls…" value="${esc(UI.logQuery)}" style="width:220px"><button class="chip-btn" data-act="issues" id="issuesBtn" aria-pressed="${UI.logIssues}">Issues only</button>`) +
      `<div class="log mount"><section class="panel log-side"><header class="panel-head"><h2 class="panel-title">Wakes</h2><div class="panel-aside" id="followBtn"></div></header><div class="panel-body flush wake-scroll" id="wakePicks"></div></section>
       <section class="panel" id="transcript"></section></div>`;
    $("#logQuery").addEventListener("input", e => { UI.logQuery = e.target.value; this.update(); });
  },
  update() {
    const st = S.state;
    const sel = selectedWakeId();
    const picks = [];
    if (st?.wake && !S.wakes.some(w => w.wake === st.wake.id)) picks.push({ wake: st.wake.id, ts: st.wake.startedAt, text: st.wake.reason, live: true });
    picks.push(...S.wakes);
    patch($("#followBtn"), UI.selWake ? '<button class="btn btn-sm btn-ghost" data-act="follow">Follow latest</button>' : '<span class="muted">following latest</span>');
    $("#issuesBtn").setAttribute("aria-pressed", String(UI.logIssues));
    patch($("#wakePicks"), picks.map(w => {
      const delta = wakeDelta(w);
      const iss = w.live ? 0 : issuesOf(w);
      return `<button class="wake-pick" data-act="pick-wake" data-id="${w.wake}" aria-current="${w.wake === sel}">
        <div class="top"><span>#${w.wake}</span><span>${esc(fmtTime(w.ts))}</span>${w.live ? '<span class="live-tag">LIVE</span>' : `<span>${esc(fmtDur(w.stats?.durationMs))}</span>`}${delta ? `<span class="delta ${delta > 0 ? "up" : "down"}">${esc(fmtSigned(delta))}</span>` : ""}</div>
        <div class="txt">${esc(w.text)}</div>${iss ? `<div class="issues">${iss} failed call${iss === 1 ? "" : "s"}</div>` : ""}</button>`;
    }).join("") || empty("No wakes yet."));

    const box = $("#transcript");
    if (!sel) { patch(box, empty("Nothing to show yet.", "Transcripts appear once the agent wakes.")); return; }
    const summary = S.wakes.find(w => w.wake === sel);
    const live = st?.wake?.id === sel;
    const entries = S.wakeLog.get(sel) ?? [];
    const q = UI.logQuery.trim().toLowerCase();
    const shown = entries.filter(e => {
      if (e.kind === "wake") return false;
      if (UI.logIssues && !(e.kind === "tool" && e.outcome !== "ok") && !(e.kind === "system")) return false;
      if (q && e.kind === "tool") return `${e.tool} ${e.summary ?? ""} ${argsBrief(e.args)}`.toLowerCase().includes(q);
      if (q) return false;
      return true;
    });
    const calls = entries.filter(e => e.kind === "tool");
    patch(box, `<div class="transcript-head">
        <div class="transcript-title"><h2>Wake #${sel}</h2>${live ? '<span class="badge b-accent">executing</span>' : ""}<span class="muted">${esc(summary?.reason ?? st?.wake?.reason ?? "")}</span><span class="muted" style="margin-left:auto">${esc(fmtTime(summary?.stats?.startedAt ?? st?.wake?.startedAt ?? entries[0]?.ts))}</span></div>
        ${summary ? `<div class="transcript-summary">${esc(summary.text)}</div>` : ""}
        <div class="statline">${summary ? wakeStatsTags(summary) : live ? `<span class="tag small">running <b data-elapsed="${st.wake.startedAt}">${esc(fmtDur(Date.now() - st.wake.startedAt))}</b></span><span class="tag small">round ${st.wake.round}</span>` : ""}
          <span class="tag small">${calls.length} calls</span>${calls.filter(c => c.outcome !== "ok").length ? `<span class="tag small"><b class="warn">${calls.filter(c => c.outcome !== "ok").length}</b> failed</span>` : ""}</div>
      </div>
      <div class="timeline">${shown.map(renderEntry).join("") || empty(entries.length ? "No entries match the filter." : "Loading transcript…")}</div>`);
  },
};

function renderEntry(e) {
  if (e.kind === "thought") {
    const open = UI.openCalls.has(e.id);
    const reasoning = e.reasoning ? `<div class="reasoning"><div class="reasoning-head" data-act="toggle-call" data-id="${e.id}" role="button" tabindex="0" aria-expanded="${open}">${icon("chevron", "caret")} Reasoning <span class="muted">${esc(fmtInt(e.reasoning.length))} chars</span></div>${open ? `<div class="reasoning-body">${esc(e.reasoning)}</div>` : ""}</div>` : "";
    return `<div class="ev thought-ev"><span class="ev-dot"></span><div class="ev-thought"><span class="who">Agent</span>${reasoning}${esc(e.text)}</div></div>`;
  }
  if (e.kind === "summary") return `<div class="ev summary-ev"><span class="ev-dot"></span><div class="ev-meta"><b style="color:var(--cyan)">Wake summary</b> — ${esc(e.text)}</div></div>`;
  if (e.kind === "system") return `<div class="ev meta-ev"><span class="ev-dot"></span><div class="ev-meta ${/error|fail/i.test(e.text ?? "") ? "bad" : ""}">${esc(e.text)}</div></div>`;
  if (e.kind !== "tool") return "";
  const oc = outcomeClass(e.outcome);
  const open = UI.openCalls.has(e.id);
  return `<div class="ev ${oc}"><span class="ev-dot"></span><div class="call ${oc}">
    <div class="call-row" data-act="toggle-call" data-id="${e.id}" role="button" tabindex="0" aria-expanded="${open}">
      <span class="call-tool">${icon("chevron", "caret")} ${esc(e.tool)}</span>
      <span class="call-sum">${esc(e.summary ?? argsBrief(e.args))}</span>
      <span class="call-meta">${e.outcome !== "ok" ? `<span class="badge ${oc === "rejected" ? "b-warn" : "b-bad"} plain">${esc(e.outcome)}</span>` : ""}<span>${esc(e.requestsSpent ?? 0)} req</span><span>${esc(e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : "–")}</span></span>
    </div>
    ${open ? `<div class="call-detail">
      ${e.summary ? `<div><h4>Outcome</h4><div class="full">${esc(e.summary)}</div></div>` : ""}
      ${e.guards?.length ? `<div><h4>Guards</h4><div class="guards">${e.guards.map(g => `<span class="guard ${g.ok ? "" : "fail"}" title="${esc(g.reason ?? "")}">${g.ok ? "✓" : "✗"} ${esc(g.guard || "guard")}</span>`).join("")}</div></div>` : ""}
      <div><h4>Arguments</h4><pre class="json">${jsonHtml(e.args ?? {})}</pre></div>
      ${e.result !== undefined && e.result !== null ? `<div><h4>Result</h4><pre class="json">${jsonHtml(e.result)}</pre></div>` : ""}
      <div class="muted" style="font-size:11.5px">${esc(new Date(e.ts).toLocaleString())} · entry ${e.id}</div>
    </div>` : ""}
  </div></div>`;
}

// ---------------------------------------------------------------- map
const WP_STYLE = {
  PLANET: { shape: "circle", r: 7, color: "#6f93e0" },
  GAS_GIANT: { shape: "giant", r: 9, color: "#cf9a64" },
  MOON: { shape: "circle", r: 3.6, color: "#8d96a8" },
  ORBITAL_STATION: { shape: "square", r: 4.2, color: "#53d3f5" },
  FUEL_STATION: { shape: "square", r: 4.2, color: "#f2d04e" },
  ASTEROID_BASE: { shape: "tri", r: 5.5, color: "#ff8a6b" },
  JUMP_GATE: { shape: "gate", r: 6.5, color: "#43d392" },
  ASTEROID: { shape: "diamond", r: 4.2, color: "#9c8c7c" },
  ENGINEERED_ASTEROID: { shape: "diamond", r: 5, color: "#c9a86a" },
  ASTEROID_FIELD: { shape: "diamond", r: 5, color: "#9c8c7c" },
  DEBRIS_FIELD: { shape: "diamond", r: 4, color: "#6d6a66" },
};
const wpStyle = t => WP_STYLE[t] ?? { shape: "circle", r: 4, color: "#6c7788" };

function glyph(style, k, x = 0, y = 0) {
  const r = style.r * k;
  const c = style.color;
  switch (style.shape) {
    case "square": return `<rect class="body" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.25}" fill="${c}"/>`;
    case "diamond": return `<path class="body" d="M${x},${y - r * 1.2}L${x + r},${y}L${x},${y + r * 1.2}L${x - r},${y}Z" fill="${c}"/>`;
    case "tri": return `<path class="body" d="M${x},${y - r * 1.1}L${x + r},${y + r * 0.8}L${x - r},${y + r * 0.8}Z" fill="${c}"/>`;
    case "gate": return `<circle class="body" cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" style="stroke:${c};stroke-width:${2.4}px"/>`;
    case "giant": return `<ellipse cx="${x}" cy="${y}" rx="${r * 1.7}" ry="${r * 0.55}" fill="none" stroke="${c}" stroke-opacity=".55" style="stroke-width:1.2px" vector-effect="non-scaling-stroke" transform="rotate(-18 ${x} ${y})"/><circle class="body" cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
    default: return `<circle class="body" cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
  }
}

VIEWS.map = {
  needs: ["universe", "markets"],
  mount() {
    view().innerHTML = head("System map", "Waypoints by type, markets ringed in amber, ships live. Drag to pan, scroll to zoom.", '<select class="field" id="sysSelect"></select>') +
      `<div class="map-layout mount"><section class="panel map-stage" id="mapStage"><svg id="mapSvg" role="img" aria-label="System map"></svg>
        <div class="empty" id="mapEmpty" hidden style="position:absolute;inset:40% 0 auto">No waypoints cached for this system yet.<br><span class="muted">They appear as the agent reads waypoints and markets.</span></div>
        <div class="map-hud"><button class="btn btn-sm" data-act="map-reset">Reset view</button></div><div class="map-legend" id="mapLegend"></div></section>
        <section class="panel" id="mapDetail"></section></div>`;
    $("#sysSelect").addEventListener("change", e => { UI.mapSystem = e.target.value; UI.mapView = null; UI.mapSel = null; this.update(); });
    bindMapInteractions();
    $("#mapLegend").innerHTML = [["PLANET", "planet"], ["GAS_GIANT", "gas giant"], ["MOON", "moon"], ["ORBITAL_STATION", "station"], ["ASTEROID", "asteroid"], ["JUMP_GATE", "jump gate"], ["FUEL_STATION", "fuel"]]
      .map(([t, l]) => `<span><svg viewBox="-8 -8 16 16">${glyph(wpStyle(t), 0.8)}</svg>${l}</span>`).join("");
  },
  update() {
    const u = S.universe;
    const sel = $("#sysSelect");
    const systems = u?.systems ?? [];
    if (!UI.mapSystem) UI.mapSystem = ships()[0]?.nav?.system ?? systems[0]?.symbol ?? null;
    const listed = UI.mapSystem && !systems.some(s => s.symbol === UI.mapSystem) ? [...systems, { symbol: UI.mapSystem }] : systems;
    patch(sel, listed.map(s => `<option ${s.symbol === UI.mapSystem ? "selected" : ""}>${esc(s.symbol)}</option>`).join("") || "<option>no systems cached</option>");
    if (UI.mapSystem && sel.value !== UI.mapSystem) sel.value = UI.mapSystem;
    renderMap();
    renderMapDetail();
  },
};

function mapModel() {
  const wps = S.universe?.waypointsBySystem?.[UI.mapSystem] ?? [];
  const bySym = new Map(wps.map(w => [w.symbol, w]));
  const parents = wps.filter(w => !w.orbits || !bySym.has(w.orbits));
  const children = new Map();
  for (const w of wps) if (w.orbits && bySym.has(w.orbits)) (children.get(w.orbits) ?? children.set(w.orbits, []).get(w.orbits)).push(w);
  return { wps, bySym, parents, children };
}

function renderMap() {
  const svg = $("#mapSvg");
  if (!svg) return;
  const { wps, bySym, parents, children } = mapModel();
  $("#mapEmpty").hidden = wps.length > 0;
  if (!wps.length) {
    patch(svg, "");
    return;
  }
  const pw = svg.clientWidth || 800, ph = svg.clientHeight || 600;
  if (!UI.mapView) {
    const xs = wps.map(w => w.x), ys = wps.map(w => -w.y);
    let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    let w = Math.max(40, maxX - minX), h = Math.max(40, maxY - minY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    w *= 1.25; h *= 1.25;
    if (w / h > pw / ph) h = (w * ph) / pw; else w = (h * pw) / ph;
    UI.mapView = { x: cx - w / 2, y: cy - h / 2, w, h, w0: w };
  }
  const v = UI.mapView;
  const k = v.w / pw; // world units per screen pixel — glyphs stay constant size on screen
  svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);

  // distance guides around the system origin
  const maxR = Math.max(...wps.map(w => Math.hypot(w.x, w.y))) * 1.1;
  const step = niceStep(maxR / 4);
  let rings = "";
  for (let r = step; r <= maxR; r += step) rings += `<circle class="ring-guide" cx="0" cy="0" r="${r}"/><text class="ring-label" x="${r + 3 * k}" y="${-3 * k}" style="font-size:${9 * k}px">${esc(fmtInt(r))}</text>`;

  const marketSet = new Set(S.markets.map(m => m.symbol));
  const fl = ships();
  const atWp = new Map();
  for (const s of fl) if (s.nav?.status !== "IN_TRANSIT" || arrivedStale(s)) (atWp.get(s.nav?.waypoint) ?? atWp.set(s.nav?.waypoint, []).get(s.nav?.waypoint)).push(s);

  const pos = new Map();
  let bodies = "";
  for (const p of parents) {
    const px = p.x, py = -p.y;
    pos.set(p.symbol, [px, py]);
    const st = wpStyle(p.type);
    const kids = children.get(p.symbol) ?? [];
    const orbitR = (st.r + 9) * k;
    let kidsSvg = "";
    kids.forEach((c, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / kids.length;
      const cx = px + Math.cos(a) * orbitR, cy = py + Math.sin(a) * orbitR;
      pos.set(c.symbol, [cx, cy]);
      kidsSvg += `<g class="wp-g${UI.mapSel === c.symbol ? " sel" : ""}" data-act="select-wp" data-wp="${esc(c.symbol)}"><title>${esc(c.symbol)} · ${esc(title(c.type))}${c.traits?.length ? ` · ${esc(c.traits.map(title).join(", "))}` : ""}</title>
        ${marketSet.has(c.symbol) ? `<circle class="mk-market" cx="${cx}" cy="${cy}" r="${(wpStyle(c.type).r + 3) * k}"/>` : ""}${glyph(wpStyle(c.type), k, cx, cy)}
        <circle cx="${cx}" cy="${cy}" r="${9 * k}" fill="transparent"/>${UI.mapSel === c.symbol ? `<text class="lbl" x="${cx}" y="${cy - 9 * k}" text-anchor="middle" style="font-size:${10 * k}px;stroke-width:${3 * k}px">${esc(wpShort(c.symbol))}</text>` : ""}</g>`;
    });
    bodies += `${kids.length ? `<circle class="orbit-ring" cx="${px}" cy="${py}" r="${orbitR}"/>` : ""}
      <g class="wp-g${UI.mapSel === p.symbol ? " sel" : ""}" data-act="select-wp" data-wp="${esc(p.symbol)}"><title>${esc(p.symbol)} · ${esc(title(p.type))}${p.traits?.length ? ` · ${esc(p.traits.map(title).join(", "))}` : ""}</title>
        ${marketSet.has(p.symbol) ? `<circle class="mk-market" cx="${px}" cy="${py}" r="${(st.r + 3.5) * k}"/>` : ""}${glyph(st, k, px, py)}
        <circle cx="${px}" cy="${py}" r="${12 * k}" fill="transparent"/>
        <text class="lbl" x="${px}" y="${py + (st.r + (kids.length ? 22 : 14)) * k}" text-anchor="middle" style="font-size:${10 * k}px;stroke-width:${3 * k}px">${esc(wpShort(p.symbol))}</text></g>${kidsSvg}`;
  }

  // ships: parked ships fan out around their waypoint; moving ships ride their route
  let shipsSvg = "", lines = "";
  const hull = (x, y, ang, label, moving, attrs = "") => `<g class="ship-mk${moving ? " moving" : ""}" ${attrs} transform="translate(${x} ${y})">${moving ? `<circle class="halo" r="${7 * k}"/>` : ""}<path class="hull" transform="rotate(${ang})" d="M${6 * k},0L${-4.5 * k},${4 * k}L${-2.5 * k},0L${-4.5 * k},${-4 * k}Z"/><text x="${7 * k}" y="${-6 * k}" style="font-size:${9 * k}px;stroke-width:${3 * k}px">${esc(label)}</text></g>`;
  for (const [sym, list] of atWp) {
    const p = pos.get(sym);
    if (!p) continue;
    list.forEach((s, i) => {
      const a = -Math.PI / 4 + i * 0.9;
      const r = 17 * k;
      shipsSvg += hull(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, -90, s.symbol.split("-").pop(), false);
    });
  }
  for (const s of fl) {
    const r = s.nav?.route;
    if (!r || arrivedStale(s)) continue;
    const a = pos.get(r.from) ?? (bySym.get(r.from) && [bySym.get(r.from).x, -bySym.get(r.from).y]);
    const b = pos.get(r.to) ?? (bySym.get(r.to) && [bySym.get(r.to).x, -bySym.get(r.to).y]);
    if (!a || !b) continue;
    const t0 = parseTs(r.departed), t1 = parseTs(r.arrival);
    const f = Math.max(0, Math.min(1, (Date.now() - t0) / (t1 - t0 || 1)));
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    lines += `<line class="transit-line" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    shipsSvg += hull(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, ang, s.symbol.split("-").pop(), true,
      `data-mv="${a[0]},${a[1]},${b[0]},${b[1]},${t0},${t1}"`);
  }
  patch(svg, `<g>${rings}</g><g>${lines}</g><g>${bodies}</g><g>${shipsSvg}</g>`);
}

function renderMapDetail() {
  const box = $("#mapDetail");
  if (!box) return;
  const { bySym } = mapModel();
  const w = bySym.get(UI.mapSel);
  if (!w) {
    const fl = ships();
    patch(box, `<header class="panel-head"><h2 class="panel-title">Ships</h2><div class="panel-aside">select a waypoint for detail</div></header><div class="panel-body flush">${fl.map(s =>
      `<div class="sched" style="grid-template-columns:auto minmax(0,1fr) auto;cursor:pointer" data-act="select-wp" data-wp="${esc(s.nav?.route && !arrivedStale(s) ? s.nav.route.to : s.nav?.waypoint)}"><span class="mono">${esc(s.symbol)}</span><span class="dim mono" style="font-size:12px">${s.nav?.route && !arrivedStale(s) ? `→ ${esc(wpShort(s.nav.route.to))}` : `@ ${esc(wpShort(s.nav?.waypoint))}`}</span>${statusBadge(s.nav?.status)}</div>`).join("") || empty("No ships.")}</div>`);
    return;
  }
  const here = ships().filter(s => s.nav?.waypoint === w.symbol && (s.nav.status !== "IN_TRANSIT" || arrivedStale(s)));
  const inbound = ships().filter(s => s.nav?.route?.to === w.symbol && s.nav.status === "IN_TRANSIT" && !arrivedStale(s));
  const m = S.markets.find(x => x.symbol === w.symbol);
  patch(box, `<header class="panel-head"><h2 class="panel-title">${esc(wpShort(w.symbol))}</h2><div class="panel-aside"><button class="btn btn-sm btn-ghost" data-act="select-wp" data-wp="">close</button></div></header>
    <div class="panel-body detail-list">
      <div><div class="mono" style="font-size:13px">${esc(w.symbol)}</div><div class="dim" style="font-size:12.5px">${esc(title(w.type))} · (${esc(w.x)}, ${esc(w.y)})${w.orbits ? ` · orbits ${esc(wpShort(w.orbits))}` : ""}${w.isUnderConstruction ? ' · <span class="warn">under construction</span>' : ""}</div></div>
      ${w.traits?.length ? `<div class="detail-row"><div class="k">Traits</div><div class="chips">${w.traits.map(t => `<span class="tag small">${esc(title(t))}</span>`).join("")}</div></div>` : ""}
      <div class="detail-row"><div class="k">Ships here</div>${here.length || inbound.length ? `<div class="chips">${here.map(s => `<span class="tag">${esc(s.symbol)}</span>`).join("")}${inbound.map(s => `<span class="tag">${esc(s.symbol)} <b data-cd="${parseTs(s.nav.route.arrival)}">${esc(fmtCountdown(parseTs(s.nav.route.arrival)))}</b></span>`).join("")}</div>` : '<span class="muted" style="font-size:12.5px">none</span>'}</div>
      ${m ? `<div class="detail-row"><div class="k">Market · seen <span data-ago="${m.fetchedAt}">${esc(fmtAgo(m.fetchedAt))}</span></div>${m.tradeGoods ? `<table class="table"><thead><tr><th>Good</th><th class="r">Buy</th><th class="r">Sell</th></tr></thead><tbody>${m.tradeGoods.map(g => `<tr><td><span class="type-chip type-${esc(g.type)}" title="${esc(g.type)}">${esc(g.type[0])}</span> <span class="mono" style="font-size:12px">${esc(g.symbol)}</span></td><td class="r num">${esc(fmtInt(g.purchasePrice))}</td><td class="r num">${esc(fmtInt(g.sellPrice))}</td></tr>`).join("")}</tbody></table>` : `<div class="dim" style="font-size:12.5px">${esc(m.note ?? "")}</div>`}<a href="#/markets" data-act="open-market" data-wp="${esc(w.symbol)}" style="font-size:12.5px">open in markets →</a></div>` : ""}
    </div>`);
}

function bindMapInteractions() {
  const svg = $("#mapSvg");
  if (!svg || svg.dataset.bound) return;
  svg.dataset.bound = "1";
  let drag = null, raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderMap(); }); };
  svg.addEventListener("pointerdown", e => {
    if (!UI.mapView) return;
    drag = { x: e.clientX, y: e.clientY, vx: UI.mapView.x, vy: UI.mapView.y, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; svg.classList.add("dragging"); }
    if (!drag.moved) return;
    const k = UI.mapView.w / svg.clientWidth;
    UI.mapView.x = drag.vx - dx * k;
    UI.mapView.y = drag.vy - dy * k;
    redraw();
  });
  const end = e => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    svg.classList.remove("dragging");
    if (!wasDrag) {
      const g = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-wp]");
      if (g) selectWp(g.dataset.wp);
    }
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", () => { drag = null; svg.classList.remove("dragging"); });
  svg.addEventListener("wheel", e => {
    if (!UI.mapView) return;
    e.preventDefault();
    const v = UI.mapView;
    const r = svg.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const wx = v.x + fx * v.w, wy = v.y + fy * v.h;
    const f = Math.exp(e.deltaY * 0.0015);
    const nw = Math.max(v.w0 / 25, Math.min(v.w0 * 4, v.w * f));
    const nh = (v.h * nw) / v.w;
    v.x = wx - fx * nw; v.y = wy - fy * nh; v.w = nw; v.h = nh;
    redraw();
  }, { passive: false });
}

function selectWp(sym) {
  UI.mapSel = sym || null;
  renderMap();
  renderMapDetail();
}

// ---------------------------------------------------------------- galaxy
// Thousands of systems: the star field is drawn on a canvas (one bitmap, no
// DOM churn, so live updates cannot flicker it); the side panel goes through
// patch() like every other view.
const STAR = {
  NEUTRON_STAR: { color: "#b9c8ff", r: 1.1, label: "neutron star" },
  RED_STAR: { color: "#ff6f5e", r: 1.3, label: "red star" },
  ORANGE_STAR: { color: "#ffa24a", r: 1.4, label: "orange star" },
  BLUE_STAR: { color: "#6fa8ff", r: 1.6, label: "blue star" },
  YOUNG_STAR: { color: "#fff1a6", r: 1.5, label: "young star" },
  WHITE_DWARF: { color: "#e9edf5", r: 1.0, label: "white dwarf" },
  BLACK_HOLE: { color: "#a07bff", r: 1.7, label: "black hole", ring: true },
  HYPERGIANT: { color: "#ffd27a", r: 2.2, label: "hypergiant" },
  NEBULA: { color: "#d38cff", r: 2.6, label: "nebula", soft: true },
  UNSTABLE: { color: "#ff5fa8", r: 1.5, label: "unstable" },
};
const starStyle = t => STAR[t] ?? { color: "#8b95a7", r: 1.2, label: title(t) };
const sysOf = wp => String(wp ?? "").split("-").slice(0, 2).join("-");
const sysShort = s => String(s ?? "").split("-")[1] ?? String(s ?? "");
const GAL_COLORS = { fleet: "#f7a531", gate: "#43d392", known: "#53d3f5", sel: "#e6e9ef", label: "#a4aebe" };

VIEWS.galaxy = {
  needs: ["universe", "galaxy"],
  mount() {
    view().innerHTML = head("Galaxy", "Every system by position and star type. Fleet systems ringed in amber, known jump links in green. Drag to pan, scroll to zoom, double-click a system to open its map.",
      '<input class="field" id="galSearch" placeholder="Find system…" autocomplete="off" spellcheck="false" style="width:180px">') +
      `<div class="map-layout mount"><section class="panel map-stage" id="galStage"><canvas id="galCanvas" role="img" aria-label="Galaxy map"></canvas>
        <div class="empty" id="galEmpty" hidden style="position:absolute;inset:40% 0 auto"></div>
        <div class="map-hud"><button class="btn btn-sm" data-act="gal-fit">Whole galaxy</button><button class="btn btn-sm" data-act="gal-fleet">Fleet</button><button class="btn btn-sm" data-act="gal-zoom" data-f="1.6" aria-label="Zoom in">+</button><button class="btn btn-sm" data-act="gal-zoom" data-f="0.625" aria-label="Zoom out">−</button></div>
        <div class="map-legend" id="galLegend"></div><div class="gal-status" id="galStatus"></div></section>
        <section class="panel" id="galDetail"></section></div>`;
    $("#galLegend").innerHTML = Object.entries(STAR).map(([, s]) => `<span><i class="star-dot" style="background:${s.color}"></i>${s.label}</span>`).join("") +
      `<span><i class="star-dot ring" style="border-color:${GAL_COLORS.fleet}"></i>fleet</span><span><i class="star-line" style="background:${GAL_COLORS.gate}"></i>jump link</span>`;
    $("#galSearch").addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const q = e.target.value.trim().toUpperCase();
      if (!q) return;
      const { rows } = galaxyModel();
      const hit = rows.find(r => r[0] === q) ?? rows.find(r => r[0].endsWith(`-${q}`)) ?? rows.find(r => r[0].includes(q));
      if (!hit) { toast(`No system matches ${q}`, true); return; }
      galSelect(hit[0], true);
    });
    bindGalaxyInteractions();
  },
  update() {
    drawGalaxy();
    renderGalaxyDetail();
  },
};

let galCache = { src: null, model: null };
function galaxyModel() {
  const src = S.galaxy;
  if (galCache.src === src && galCache.model) return galCache.model;
  const rows = src?.systems ?? [];
  const bySym = new Map(rows.map(r => [r[0], r]));
  const byType = new Map();
  for (const r of rows) (byType.get(r[3]) ?? byType.set(r[3], []).get(r[3])).push(r);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rows) { minX = Math.min(minX, r[1]); maxX = Math.max(maxX, r[1]); minY = Math.min(minY, -r[2]); maxY = Math.max(maxY, -r[2]); }
  galCache = { src, model: { rows, bySym, byType, bounds: rows.length ? { minX, maxX, minY, maxY } : null } };
  return galCache.model;
}

/** Fleet presence per system: ships parked or cruising inside it, and ships jumping/warping between systems. */
function galaxyFleet() {
  const at = new Map(), moving = [];
  for (const s of ships()) {
    const r = s.nav?.route;
    if (r && !arrivedStale(s) && sysOf(r.from) !== sysOf(r.to)) { moving.push({ s, from: sysOf(r.from), to: sysOf(r.to), t0: parseTs(r.departed), t1: parseTs(r.arrival) }); continue; }
    const sys = s.nav?.system ?? sysOf(s.nav?.waypoint);
    (at.get(sys) ?? at.set(sys, []).get(sys)).push(s);
  }
  return { at, moving };
}

function galFit(bounds, pw, ph, pad = 1.12) {
  const w = Math.max(20, (bounds.maxX - bounds.minX) * pad), h = Math.max(20, (bounds.maxY - bounds.minY) * pad);
  return { cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2, scale: Math.min(pw / w, ph / h) };
}

function galSize() {
  const c = $("#galCanvas");
  return c ? { w: c.clientWidth || 800, h: c.clientHeight || 600 } : { w: 800, h: 600 };
}

function galEnsureView() {
  const { bounds } = galaxyModel();
  if (!bounds) return null;
  const { w, h } = galSize();
  const fit = galFit(bounds, w, h);
  if (!UI.galView) UI.galView = { ...fit };
  UI.galView.min = fit.scale * 0.5;
  UI.galView.max = fit.scale * 3000;
  return UI.galView;
}

function galZoomTo(v, scale, fx, fy) {
  // keep the world point under (fx, fy) screen px fixed while zooming
  const { w, h } = galSize();
  const ns = Math.max(v.min, Math.min(v.max, scale));
  const wx = v.cx + (fx - w / 2) / v.scale, wy = v.cy + (fy - h / 2) / v.scale;
  v.cx = wx - (fx - w / 2) / ns; v.cy = wy - (fy - h / 2) / ns; v.scale = ns;
}

let galRaf = 0;
const galRedraw = () => { if (!galRaf) galRaf = requestAnimationFrame(() => { galRaf = 0; drawGalaxy(); }); };

function drawGalaxy() {
  const canvas = $("#galCanvas");
  if (!canvas) return;
  const { rows, bySym, byType } = galaxyModel();
  const st = S.universe?.galaxy;
  const emptyEl = $("#galEmpty");
  emptyEl.hidden = rows.length > 0;
  if (!rows.length) patch(emptyEl, st && !st.complete
    ? `Loading the galaxy…<br><span class="muted">${st.count ? `${esc(fmtInt(st.count))} of ${esc(fmtInt(st.total))} systems so far · ` : ""}it is read while the agent sleeps</span>`
    : 'No systems cached yet.<br><span class="muted">The system list is fetched once, in the background, while the agent sleeps.</span>');
  patch($("#galStatus"), st && !st.complete && rows.length ? `<span class="tag small">loading ${esc(fmtInt(st.count))} / ${st.total ? esc(fmtInt(st.total)) : "?"} systems</span>` : "");

  const dpr = window.devicePixelRatio || 1;
  const { w, h } = galSize();
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const v = galEnsureView();
  if (!v) return;
  const X = x => (x - v.cx) * v.scale + w / 2, Y = y => (-y - v.cy) * v.scale + h / 2;
  const on = (sx, sy, m = 40) => sx > -m && sx < w + m && sy > -m && sy < h + m;
  const zoom = Math.max(0.7, Math.min(3.2, 0.8 + 0.35 * Math.log2(v.scale / (v.min * 2))));

  // jump links under everything
  const links = S.universe?.gateLinks ?? [];
  ctx.lineWidth = 1.2; ctx.strokeStyle = GAL_COLORS.gate; ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (const [a, b] of links) {
    const ra = bySym.get(a), rb = bySym.get(b);
    if (!ra || !rb) continue;
    ctx.moveTo(X(ra[1]), Y(ra[2])); ctx.lineTo(X(rb[1]), Y(rb[2]));
  }
  ctx.stroke();

  // stars, one fillStyle per type
  let visible = 0;
  for (const [type, list] of byType) {
    const s = starStyle(type);
    const r = s.r * zoom;
    ctx.fillStyle = s.color;
    ctx.globalAlpha = s.soft ? 0.45 : 0.9;
    for (const row of list) {
      const sx = X(row[1]), sy = Y(row[2]);
      if (!on(sx, sy, 10)) continue;
      visible++;
      if (r < 1.3) { ctx.fillRect(sx - r, sy - r, r * 2, r * 2); continue; }
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.fill();
      if (s.ring && zoom >= 1.5) { ctx.strokeStyle = s.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, r + 2.2, 0, 6.2832); ctx.stroke(); }
    }
  }
  ctx.globalAlpha = 1;

  // systems the harness has read: small cyan tick ring
  const intel = S.universe?.intel ?? {};
  ctx.strokeStyle = GAL_COLORS.known; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
  for (const sym of Object.keys(intel)) {
    const row = bySym.get(sym);
    if (!row) continue;
    const sx = X(row[1]), sy = Y(row[2]);
    if (!on(sx, sy)) continue;
    ctx.beginPath(); ctx.arc(sx, sy, 4 + zoom * 1.5, 0, 6.2832); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // labels when zoomed in far enough that they fit
  ctx.font = "500 10px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  const { at, moving } = galaxyFleet();
  if (visible <= 220) {
    ctx.fillStyle = GAL_COLORS.label; ctx.globalAlpha = 0.8;
    for (const row of rows) {
      if (at.has(row[0]) || row[0] === UI.galSel) continue; // those get their own label below
      const sx = X(row[1]), sy = Y(row[2]);
      if (on(sx, sy, 0)) ctx.fillText(sysShort(row[0]), sx + 5 + zoom, sy);
    }
    ctx.globalAlpha = 1;
  }

  // text with a dark halo so it stays readable over dense star fields
  const label = (text, x, y, color) => {
    ctx.lineWidth = 3; ctx.strokeStyle = "#07090d"; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  };
  // fleet systems: amber ring, ship count; HQ gets a second ring
  const hq = S.state?.agent?.headquarters ? sysOf(S.state.agent.headquarters) : null;
  ctx.font = "600 11px 'IBM Plex Mono', ui-monospace, monospace";
  const ring = (sym, color, rad, width = 2) => {
    const row = bySym.get(sym);
    if (!row) return null;
    const sx = X(row[1]), sy = Y(row[2]);
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(sx, sy, rad, 0, 6.2832); ctx.stroke();
    return [sx, sy];
  };
  if (hq) ring(hq, GAL_COLORS.fleet, 13, 1);
  for (const [sym, list] of at) {
    const p = ring(sym, GAL_COLORS.fleet, 9, 2);
    if (!p) continue;
    label(`${sysShort(sym)} · ${list.length} ship${list.length === 1 ? "" : "s"}`, p[0] + 15, p[1] - 9, GAL_COLORS.fleet);
  }

  // ships jumping or warping between systems ride their route
  const now = Date.now();
  for (const m of moving) {
    const a = bySym.get(m.from), b = bySym.get(m.to);
    if (!a || !b) continue;
    const ax = X(a[1]), ay = Y(a[2]), bx = X(b[1]), by = Y(b[2]);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "#53d3f5"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    const f = Math.max(0, Math.min(1, (now - m.t0) / (m.t1 - m.t0 || 1)));
    const sx = ax + (bx - ax) * f, sy = ay + (by - ay) * f, ang = Math.atan2(by - ay, bx - ax);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
    ctx.fillStyle = "#53d3f5"; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 4.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-5, -4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    label(m.s.symbol.split("-").pop(), sx + 8, sy - 9, "#53d3f5");
  }

  // hover and selection on top
  for (const [sym, color, rad] of [[UI.galHover, GAL_COLORS.label, 7], [UI.galSel, GAL_COLORS.sel, 11]]) {
    if (!sym || (rad === 7 && sym === UI.galSel)) continue;
    const p = ring(sym, color, rad, 1.5);
    if (!p) continue;
    const row = bySym.get(sym);
    label(`${sym} · ${starStyle(row[3]).label}`, p[0] + rad + 5, p[1] + rad + 6, GAL_COLORS.sel);
  }
}

function renderGalaxyDetail() {
  const box = $("#galDetail");
  if (!box) return;
  const { bySym, rows } = galaxyModel();
  const { at, moving } = galaxyFleet();
  const intel = S.universe?.intel ?? {};
  const links = S.universe?.gateLinks ?? [];
  const st = S.universe?.galaxy;
  const sel = UI.galSel && bySym.get(UI.galSel);
  const sysLink = (sym, extra = "") => `<a href="#/galaxy" class="mono" data-act="gal-select" data-sys="${esc(sym)}">${esc(sym)}</a>${extra}`;
  if (!sel) {
    const fleetSystems = [...at.entries()].sort((a, b) => b[1].length - a[1].length);
    const source = st?.complete ? (st.source === "dump" ? "bulk dump" : "system list") : "loading";
    patch(box, `<header class="panel-head"><h2 class="panel-title">Fleet systems</h2><div class="panel-aside">select a system for detail</div></header>
      <div class="panel-body flush">${fleetSystems.map(([sym, list]) =>
        `<div class="sched" style="grid-template-columns:minmax(0,1fr) auto;cursor:pointer" data-act="gal-select" data-sys="${esc(sym)}"><span class="mono">${esc(sym)}</span><span class="dim" style="font-size:12px">${list.length} ship${list.length === 1 ? "" : "s"}</span></div>`).join("")}
        ${moving.map(m => `<div class="sched" style="grid-template-columns:minmax(0,1fr) auto"><span class="mono" style="font-size:12px">${esc(m.s.symbol)} <span class="dim">${esc(sysShort(m.from))} → ${esc(sysShort(m.to))}</span></span><b class="mono" style="font-size:12px" data-cd="${m.t1}">${esc(fmtCountdown(m.t1))}</b></div>`).join("")}
        ${fleetSystems.length || moving.length ? "" : empty("No ships yet.")}</div>
      <div class="panel-body dim" style="border-top:1px solid var(--line);font-size:12.5px">${esc(fmtInt(rows.length))} systems${st?.total && !st.complete ? ` of ${esc(fmtInt(st.total))}` : ""} · ${esc(source)} · ${esc(fmtInt(Object.keys(intel).length))} read by the harness · ${esc(fmtInt(links.length))} jump links known</div>`);
    return;
  }
  const [sym, x, y, type, wpCount, factions] = sel;
  const info = intel[sym];
  const here = at.get(sym) ?? [];
  const inbound = moving.filter(m => m.to === sym);
  const neighbors = links.filter(l => l.includes(sym)).map(l => (l[0] === sym ? l[1] : l[0]));
  const dist = (a, b) => (a && b ? Math.round(Math.hypot(a[1] - b[1], a[2] - b[2])) : null);
  const hq = S.state?.agent?.headquarters ? bySym.get(sysOf(S.state.agent.headquarters)) : null;
  const nearestFleet = [...at.keys()].filter(s => s !== sym).map(s => [s, dist(sel, bySym.get(s))]).filter(([, d]) => d !== null).sort((a, b) => a[1] - b[1])[0];
  const cached = !!S.universe?.waypointsBySystem?.[sym]?.length;
  patch(box, `<header class="panel-head"><h2 class="panel-title">${esc(sym)}</h2><div class="panel-aside"><button class="btn btn-sm btn-ghost" data-act="gal-select" data-sys="">close</button></div></header>
    <div class="panel-body detail-list">
      <div><div style="font-size:13px"><i class="star-dot" style="background:${starStyle(type).color}"></i> ${esc(starStyle(type).label)}</div><div class="dim" style="font-size:12.5px">(${esc(fmtInt(x))}, ${esc(fmtInt(y))}) · ${esc(wpCount)} waypoints${factions ? ` · ${esc(factions.split(",").map(title).join(", "))}` : ""}</div></div>
      <div class="detail-row"><div class="k">Distance</div><div style="font-size:12.5px">${hq && hq !== sel ? `${esc(fmtInt(dist(sel, hq)))} from HQ ${esc(sysShort(hq[0]))}` : hq === sel ? "headquarters system" : "–"}${nearestFleet ? `<br>${esc(fmtInt(nearestFleet[1]))} from ${esc(sysShort(nearestFleet[0]))} (fleet)` : ""}</div></div>
      <div class="detail-row"><div class="k">Harness knows</div><div style="font-size:12.5px">${info ? `${info.mapped ? "fully mapped" : info.scouted ? "scouted for shipyards and markets" : "system record only"}${info.markets || info.shipyards ? ` · ${info.markets} market${info.markets === 1 ? "" : "s"}, ${info.shipyards} shipyard${info.shipyards === 1 ? "" : "s"}` : ""}${info.gate ? " · has a jump gate" : ""}` : '<span class="muted">not read yet</span>'}</div></div>
      <div class="detail-row"><div class="k">Jump links</div>${neighbors.length ? `<div class="chips">${neighbors.map(n => `<span class="tag">${sysLink(n)}</span>`).join("")}</div>` : '<span class="muted" style="font-size:12.5px">none known</span>'}</div>
      <div class="detail-row"><div class="k">Ships here</div>${here.length || inbound.length ? `<div class="chips">${here.map(s => `<span class="tag">${esc(s.symbol)}</span>`).join("")}${inbound.map(m => `<span class="tag">${esc(m.s.symbol)} <b data-cd="${m.t1}">${esc(fmtCountdown(m.t1))}</b></span>`).join("")}</div>` : '<span class="muted" style="font-size:12.5px">none</span>'}</div>
      <div><button class="btn btn-sm" data-act="gal-open" data-sys="${esc(sym)}">Open system map</button>${cached ? "" : '<div class="muted" style="font-size:12px;margin-top:6px">No waypoints cached for it yet; the map fills in once a ship or the collector reads them.</div>'}</div>
    </div>`);
}

function galSelect(sym, center = false) {
  UI.galSel = sym || null;
  if (center && sym) {
    const row = galaxyModel().bySym.get(sym);
    const v = galEnsureView();
    if (row && v) { v.cx = row[1]; v.cy = -row[2]; v.scale = Math.max(v.scale, v.min * 60); }
  }
  drawGalaxy();
  renderGalaxyDetail();
}

/** Frames the fleet's systems with their neighborhood: known jump links and the nearest dozen systems around each. */
function galFleetView() {
  const { bySym, rows } = galaxyModel();
  const v = galEnsureView();
  if (!v) return;
  const { at, moving } = galaxyFleet();
  const home = new Set([...at.keys(), ...moving.flatMap(m => [m.from, m.to])]);
  const pts = [];
  for (const sym of home) {
    const c = bySym.get(sym);
    if (!c) continue;
    pts.push(c);
    const near = rows.map(r => [r, (r[1] - c[1]) ** 2 + (r[2] - c[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(1, 13);
    pts.push(...near.map(([r]) => r));
  }
  for (const [a, b] of S.universe?.gateLinks ?? []) if (home.has(a) || home.has(b)) pts.push(bySym.get(a), bySym.get(b));
  const list = pts.filter(Boolean);
  if (!list.length) return;
  const xs = list.map(r => r[1]), ys = list.map(r => -r[2]);
  const { w, h } = galSize();
  Object.assign(v, galFit({ minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }, w, h, 1.2));
  v.scale = Math.max(v.min, Math.min(v.max, v.scale));
  drawGalaxy();
}

function galHit(clientX, clientY, maxPx = 12) {
  const canvas = $("#galCanvas");
  const v = UI.galView;
  if (!canvas || !v) return null;
  const r = canvas.getBoundingClientRect();
  const mx = clientX - r.left, my = clientY - r.top;
  let best = null, bestD = maxPx * maxPx;
  for (const row of galaxyModel().rows) {
    const dx = (row[1] - v.cx) * v.scale + r.width / 2 - mx, dy = (-row[2] - v.cy) * v.scale + r.height / 2 - my;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = row[0]; }
  }
  return best;
}

function bindGalaxyInteractions() {
  const c = $("#galCanvas");
  if (!c || c.dataset.bound) return;
  c.dataset.bound = "1";
  let drag = null;
  c.addEventListener("pointerdown", e => {
    if (!UI.galView) return;
    drag = { x: e.clientX, y: e.clientY, cx: UI.galView.cx, cy: UI.galView.cy, moved: false };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener("pointermove", e => {
    if (!drag) {
      const hit = galHit(e.clientX, e.clientY);
      if (hit !== UI.galHover) { UI.galHover = hit; c.style.cursor = hit ? "pointer" : ""; galRedraw(); }
      return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; c.classList.add("dragging"); }
    if (!drag.moved) return;
    UI.galView.cx = drag.cx - dx / UI.galView.scale;
    UI.galView.cy = drag.cy - dy / UI.galView.scale;
    galRedraw();
  });
  c.addEventListener("pointerup", e => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    c.classList.remove("dragging");
    if (!wasDrag) galSelect(galHit(e.clientX, e.clientY));
  });
  c.addEventListener("pointercancel", () => { drag = null; c.classList.remove("dragging"); });
  c.addEventListener("pointerleave", () => { if (UI.galHover) { UI.galHover = null; galRedraw(); } });
  c.addEventListener("dblclick", e => { const hit = galHit(e.clientX, e.clientY); if (hit) openSystemMap(hit); });
  c.addEventListener("wheel", e => {
    if (!UI.galView) return;
    e.preventDefault();
    const r = c.getBoundingClientRect();
    galZoomTo(UI.galView, UI.galView.scale * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    galRedraw();
  }, { passive: false });
}

function openSystemMap(sym) {
  UI.mapSystem = sym; UI.mapView = null; UI.mapSel = null;
  location.hash = "#/map";
}

// ---------------------------------------------------------------- markets
VIEWS.markets = {
  needs: ["markets", "universe", "history"],
  mount() {
    view().innerHTML = head("Markets", "Latest prices the agent has seen, and where the spreads are. Prices are only visible while a ship is at a market, so every figure shows its age.",
      `<input class="field" id="goodQuery" placeholder="Filter goods…" value="${esc(UI.marketQuery)}" style="width:200px"><div class="tabs" role="tablist" id="marketTabs"></div>`) +
      '<div class="mount" id="marketBody"></div>';
    $("#goodQuery").addEventListener("input", e => { UI.marketQuery = e.target.value; this.update(); });
  },
  update() {
    patch($("#marketTabs"), [["opps", "Opportunities"], ["browse", "Market browser"]]
      .map(([k, l]) => `<button role="tab" data-act="market-tab" data-k="${k}" aria-selected="${UI.marketTab === k}">${l}</button>`).join(""));
    const body = $("#marketBody");
    if (!S.markets.length) { patch(body, `<section class="panel">${empty("No market data yet.", "It fills as the agent reads markets with a ship present.")}</section>`); return; }
    if (UI.marketTab === "opps") patch(body, renderOpps());
    else patch(body, renderBrowser());
  },
};

function wpCoords() {
  const map = new Map();
  for (const list of Object.values(S.universe?.waypointsBySystem ?? {})) for (const w of list) map.set(w.symbol, w);
  return map;
}

function renderOpps() {
  const q = UI.marketQuery.trim().toUpperCase();
  const byGood = new Map();
  for (const m of S.markets) for (const g of m.tradeGoods ?? []) {
    if (q && !g.symbol.includes(q)) continue;
    const e = byGood.get(g.symbol) ?? byGood.set(g.symbol, { buys: [], sells: [] }).get(g.symbol);
    const leg = { wp: m.symbol, supply: g.supply, vol: g.tradeVolume, at: m.fetchedAt };
    if (g.type !== "IMPORT") e.buys.push({ ...leg, price: g.purchasePrice });
    if (g.type !== "EXPORT") e.sells.push({ ...leg, price: g.sellPrice });
  }
  const coords = wpCoords();
  const rows = [];
  for (const [good, { buys, sells }] of byGood) {
    let best = null;
    for (const b of buys) for (const s of sells) {
      if (b.wp === s.wp || !(s.price > b.price)) continue;
      const vol = Math.min(b.vol, s.vol);
      const lot = (s.price - b.price) * vol;
      if (!best || lot > best.lot) best = { good, b, s, vol, lot, spread: s.price - b.price };
    }
    if (best) {
      const a = coords.get(best.b.wp), c = coords.get(best.s.wp);
      best.dist = a && c ? Math.hypot(a.x - c.x, a.y - c.y) : null;
      rows.push(best);
    }
  }
  rows.sort((x, y) => y.lot - x.lot);
  const age = ts => { const d = Date.now() - ts; return `<span class="${d > 6 * 3600_000 ? "bad" : d > 2 * 3600_000 ? "warn" : "muted"}" data-ago="${ts}">${esc(fmtAgo(ts))}</span>`; };
  const leg = (l, kind) => `<div class="opp-leg"><span class="wp">${esc(wpShort(l.wp))} · <b>${esc(fmtInt(l.price))}</b></span><small>${esc(title(l.supply))} supply · ${age(l.at)}</small></div>`;
  return panel("Trade opportunities", rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Good</th><th>Buy at</th><th>Sell at</th><th class="r">Spread / unit</th><th class="r">Margin</th><th class="r">Per lot</th><th class="r">Distance</th></tr></thead><tbody>${rows.slice(0, 30).map(r => `<tr>
      <td class="opp-good">${esc(r.good)}</td><td>${leg(r.b, "buy")}</td><td>${leg(r.s, "sell")}</td>
      <td class="r num">+${esc(fmtInt(r.spread))}</td><td class="r num">${esc(Math.round((r.spread / r.b.price) * 100))}%</td>
      <td class="r"><span class="profit">+${esc(fmtInt(r.lot))}</span><div class="muted" style="font-size:11px">${esc(r.vol)} units</div></td>
      <td class="r num">${r.dist == null ? '<span class="muted">—</span>' : esc(fmtInt(r.dist))}</td></tr>`).join("")}</tbody></table></div>` : empty(q ? "No profitable pair for that filter." : "No profitable pairs in the markets seen so far."),
    { bodyCls: "panel-body flush", aside: "best buy→sell pair per good · lot = spread × smaller trade volume · before fuel" });
}

function renderBrowser() {
  if (!UI.marketSel || !S.markets.some(m => m.symbol === UI.marketSel)) {
    UI.marketSel = S.markets[0]?.symbol ?? null;
    if (UI.marketSel && !S.history.has(UI.marketSel)) LOADERS.history().then(() => VIEWS.markets.update());
  }
  const q = UI.marketQuery.trim().toUpperCase();
  const list = S.markets.filter(m => !q || (m.tradeGoods ?? []).some(g => g.symbol.includes(q)) || [...(m.exports ?? []), ...(m.imports ?? []), ...(m.exchange ?? [])].some(g => g.includes(q)));
  const m = S.markets.find(x => x.symbol === UI.marketSel);
  const hist = S.history.get(UI.marketSel) ?? [];
  const series = new Map();
  for (const p of [...hist].sort((a, b) => a.ts - b.ts)) (series.get(p.good) ?? series.set(p.good, []).get(p.good)).push(p.purchasePrice);
  const goods = (m?.tradeGoods ?? []).filter(g => !q || g.symbol.includes(q));
  return `<div class="market-layout">${panel("Markets", `<table class="table"><tbody>${list.map(x => `<tr class="clickable${x.symbol === UI.marketSel ? " selected" : ""}" data-act="select-market" data-wp="${esc(x.symbol)}"><td><span class="mono">${esc(wpShort(x.symbol))}</span><div class="muted" style="font-size:11.5px">${x.tradeGoods ? `${x.tradeGoods.length} goods` : "no prices"}</div></td><td class="r muted" style="font-size:12px" data-ago="${x.fetchedAt}">${esc(fmtAgo(x.fetchedAt))}</td></tr>`).join("")}</tbody></table>`, { bodyCls: "panel-body flush" })}
    ${panel(esc(m?.symbol ?? "—"), m?.tradeGoods ? `<div class="table-wrap"><table class="table"><thead><tr><th>Good</th><th>Type</th><th>Supply</th><th>Activity</th><th class="r">Buy</th><th class="r">Sell</th><th class="r">Volume</th><th>Buy price trend</th></tr></thead><tbody>${goods.map(g => `<tr>
        <td class="mono" style="font-size:12.5px">${esc(g.symbol)}</td><td><span class="type-chip type-${esc(g.type)}">${esc(g.type)}</span></td><td>${supplyPips(g.supply)}</td><td class="dim" style="font-size:12.5px">${esc(title(g.activity ?? "—"))}</td>
        <td class="r num">${esc(fmtInt(g.purchasePrice))}</td><td class="r num">${esc(fmtInt(g.sellPrice))}</td><td class="r num">${esc(fmtInt(g.tradeVolume))}</td><td>${spark(series.get(g.symbol) ?? [])}</td></tr>`).join("")}</tbody></table></div>`
      : empty(esc(m?.note ?? "No prices for this market.")), { bodyCls: "panel-body flush", aside: m ? `seen <span data-ago="${m.fetchedAt}">${esc(fmtAgo(m.fetchedAt))}</span>` : "" })}</div>`;
}

// ---------------------------------------------------------------- contracts
VIEWS.contracts = {
  needs: [],
  mount() {
    view().innerHTML = head("Contracts", "Offers, active deliveries and history. Deadlines count down live.") + '<div class="contract-cols mount" id="contractCols"></div>';
  },
  update() {
    const cs = contracts();
    const cols = [
      ["Active", cs.filter(c => c.accepted && isOpenContract(c))],
      ["Offered", cs.filter(c => !c.accepted && isOpenContract(c))],
      ["Closed", cs.filter(c => !isOpenContract(c))],
    ];
    patch($("#contractCols"), cols.map(([name, list]) => `<div><div class="col-head">${name}<span class="count">${list.length}</span></div><div class="col-stack">${list.map(renderContract).join("") || `<section class="panel">${empty(name === "Offered" ? "No open offers." : name === "Active" ? "No active contracts." : "Nothing closed yet.")}</section>`}</div></div>`).join(""));
  },
};

function renderContract(c) {
  const closed = !isOpenContract(c);
  const dl = contractDeadline(c);
  const left = dl - Date.now();
  const cls = closed ? "" : left < 0 ? "over" : left < 24 * 3600_000 ? "soon" : "";
  const status = c.fulfilled ? '<span class="badge b-good">fulfilled</span>' : c.expired ? '<span class="badge b-bad">expired</span>' : c.accepted ? '<span class="badge b-accent">in progress</span>' : '<span class="badge b-cyan">offered</span>';
  return `<article class="panel contract${closed ? " closed" : ""}">
    <div class="contract-top">${status}<span class="tag small">${esc(title(c.type))}</span><span class="muted" style="font-size:12px">${esc(c.faction)}</span><span class="mono muted" style="margin-left:auto;font-size:11px" title="${esc(c.id)}">${esc(c.id.slice(0, 10))}</span></div>
    <div class="contract-pay"><div><span>On accept</span><b>${esc(fmtInt(c.payment?.onAccepted))}</b></div><div><span>On fulfil</span><b class="good">${esc(fmtInt(c.payment?.onFulfilled))}</b></div><div><span>Total</span><b>${esc(fmtInt((c.payment?.onAccepted ?? 0) + (c.payment?.onFulfilled ?? 0)))}</b></div></div>
    ${c.deliverables.map(d => { const p = d.required ? Math.min(100, (d.fulfilled / d.required) * 100) : 0; return `<div class="deliv"><div class="deliv-top"><span><span class="mono">${esc(d.symbol)}</span> <span class="muted">→ ${esc(wpShort(d.destination))}</span></span><span class="mono">${esc(d.fulfilled)} / ${esc(d.required)}</span></div><div class="bar"><i style="width:${p.toFixed(1)}%"></i></div></div>`; }).join("")}
    ${isNum(dl) ? `<div class="deadline ${cls}">${closed ? "deadline was" : c.accepted ? "deliver by" : "accept by"} <b ${closed ? "" : `data-cd="${dl}"`}>${esc(closed ? fmtTime(dl) : fmtCountdown(dl))}</b><span class="muted">${esc(new Date(dl).toLocaleString())}</span></div>` : ""}
  </article>`;
}

// ---------------------------------------------------------------- memory
VIEWS.memory = {
  needs: ["memory"],
  mount() {
    view().innerHTML = head("Memory", "What the agent knows between wakes: durable goals and the notes it chose to remember.") + `
      <div class="two-col mount">
        ${panel("Goals", `<form class="form-row" id="goalForm" style="margin-bottom:12px"><input class="field" id="goalInput" placeholder="Add a goal for the agent…" maxlength="2000" autocomplete="off"><button class="btn btn-primary">Add</button></form><div id="goalList" style="margin:0 -16px -16px"></div>`, { aside: "injected into every wake" })}
        ${panel("Notes", '<div class="form-row" style="margin-bottom:10px"><input class="field" id="noteQuery" placeholder="Search notes…"></div><div class="chips" id="noteKinds" style="margin-bottom:6px"></div><div id="noteList" style="margin:0 -16px -16px"></div>', { aside: '<span id="noteCount"></span>' })}
      </div>`;
    $("#goalForm").addEventListener("submit", async e => {
      e.preventDefault();
      const text = $("#goalInput").value.trim();
      if (!text) return;
      try { await post("/api/memory/goals", { description: text }); $("#goalInput").value = ""; toast("Goal added — the agent sees it next wake"); }
      catch (err) { toast(`Could not add goal: ${err.message}`, true); }
      await load(["memory"]); this.update(); renderChrome();
    });
    $("#noteQuery").value = UI.noteQuery;
    $("#noteQuery").addEventListener("input", e => { UI.noteQuery = e.target.value; this.update(); });
  },
  update() {
    const m = S.memory;
    if (!m) return;
    const goals = [...m.goals].sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || b.createdAt - a.createdAt);
    patch($("#goalList"), goals.map(g => `<div class="goal${g.status !== "active" ? " done" : ""}"><div><div class="goal-text">${esc(g.description)}</div><div class="goal-meta">${esc(g.status)} · set <span data-ago="${g.createdAt}">${esc(fmtAgo(g.createdAt))}</span>${g.deadline ? ` · due ${esc(fmtTime(parseTs(g.deadline)))}` : ""}</div></div>${g.status === "active" ? `<button class="btn btn-sm" data-act="complete-goal" data-id="${esc(g.id)}">Done</button>` : ""}</div>`).join("") || empty("No goals yet."));
    const kinds = ["fact", "strategy", "observation", "todo"];
    patch($("#noteKinds"), [["", "All"], ...kinds.map(k => [k, k])].map(([k, l]) => `<button class="chip-btn" data-act="note-kind" data-k="${k}" aria-pressed="${UI.noteKind === k}">${esc(l)} <span class="muted">${k ? m.notes.filter(n => n.kind === k).length : m.notes.length}</span></button>`).join(""));
    const q = UI.noteQuery.trim().toLowerCase();
    const notes = m.notes.filter(n => (!UI.noteKind || n.kind === UI.noteKind) && (!q || `${n.content} ${n.tags.join(" ")}`.toLowerCase().includes(q)))
      .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt);
    $("#noteCount").textContent = `${notes.length} of ${m.notes.length}`;
    const kindCls = { fact: "b-blue", strategy: "b-accent", observation: "b-cyan", todo: "b-warn" };
    patch($("#noteList"), notes.map(n => `<div class="note"><div class="note-side"><span class="badge plain ${kindCls[n.kind] ?? ""}">${esc(n.kind)}</span><span class="pips" title="importance ${n.importance}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n.importance ? "on" : ""}"></i>`).join("")}</span></div>
      <div><div class="note-body">${esc(n.content)}</div><div class="note-tags">${n.tags.map(t => `<span class="tag small">#${esc(t)}</span>`).join("")}<span class="muted" style="font-size:11.5px;margin-left:4px" data-ago="${n.createdAt}">${esc(fmtAgo(n.createdAt))}</span></div></div></div>`).join("") || empty(m.notes.length ? "No notes match." : "The agent hasn't remembered anything yet."));
  },
};

// ---------------------------------------------------------------- agent
VIEWS.agent = {
  needs: ["tools"],
  mount() {
    view().innerHTML = head("Agent", "Control surface and configuration. The agent is fully autonomous — these are the only levers.") + `
      <div class="two-col mount">
        <div class="stack">
          ${panel("Control", '<div id="ctrlBody"></div>')}
          ${panel("Directive", `<div id="directiveNow" style="margin-bottom:10px"></div><form id="directiveForm" class="stack" style="gap:8px"><textarea class="field" id="directiveInput" rows="3" maxlength="2000" placeholder="A nudge injected into every wake's working memory, e.g. “prioritise the iron ore contract; don't buy ships yet”"></textarea><div class="form-row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="clear-directive">Clear</button><button class="btn btn-primary">Set directive</button></div></form>`, { aside: "persists until cleared" })}
          ${panel("Scheduled wakeups", '<div id="schedList" style="margin:0 -16px -16px"></div>', { aside: '<span id="schedCount"></span>' })}
          ${panel("Runtime", '<dl class="kv-list" id="runtimeKv"></dl>')}
        </div>
        ${panel("Tools", '<input class="field" id="toolQuery" placeholder="Search tools…" style="width:100%;margin-bottom:8px"><div id="toolList" style="margin:0 -16px -16px"></div>', { aside: '<span id="toolCount"></span>' })}
      </div>`;
    $("#directiveForm").addEventListener("submit", async e => {
      e.preventDefault();
      await setDirective($("#directiveInput").value);
    });
    $("#toolQuery").value = UI.toolQuery;
    $("#toolQuery").addEventListener("input", e => { UI.toolQuery = e.target.value; this.update(); });
  },
  update() {
    const st = S.state;
    if (!st) return;
    const paused = st.scheduler.paused;
    patch($("#ctrlBody"), `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        ${st.wake ? `<span class="badge b-accent">executing wake #${st.wake.id}</span>` : paused ? '<span class="badge b-warn">paused</span>' : '<span class="badge b-good">standing by</span>'}
        <span class="dim" style="font-size:12.5px">${st.lastWakeEndedAt ? `last wake ended <span data-ago="${st.lastWakeEndedAt}">${esc(fmtAgo(st.lastWakeEndedAt))}</span>` : ""}</span>
        <span style="margin-left:auto;display:flex;gap:8px"><button class="btn" data-act="wake">Wake now</button><button class="btn ${paused ? "btn-primary" : ""}" data-act="toggle-pause">${paused ? "Resume" : "Pause"}</button></span></div>
      <p class="dim" style="font-size:12.5px;margin:12px 0 0">Pausing holds scheduled wakeups; a manual wake still runs one loop. Every registered tool — purchases and scrapping included — runs at the agent's discretion under guard and policy checks.</p>`);
    patch($("#directiveNow"), st.scheduler.directive ? `<div class="directive-now">${esc(st.scheduler.directive)}</div>` : '<span class="muted" style="font-size:13px">No directive set.</span>');
    const pend = st.scheduler.pending;
    $("#schedCount").textContent = `${pend.length} pending`;
    patch($("#schedList"), pend.map(w => `<div class="sched"><span class="when" data-cd="${w.at}">${esc(fmtCountdown(w.at))}</span><span>${esc(w.reason)}</span><span class="tag small">${esc(w.scope)}</span></div>`).join("") || empty(paused ? "Paused — nothing scheduled." : "Nothing scheduled."));
    const c = st.config, l = st.llm;
    const kv = [
      ["Model", c.model], ["Policy", c.policy], ["Max actions / wake", c.maxActionsPerWake], ["Max rounds / wake", c.maxRoundsPerWake],
      ["Tool concurrency", c.maxConcurrentTools], ["Fallback wake", fmtDur(c.fallbackWakeMs)], ["Wake merge window", fmtDur(c.minWakeGapMs)],
      ["Min request interval", `${c.minIntervalMs} ms`], ["API requests (session)", fmtInt(st.requestsTotal)],
      ["LLM calls", fmtInt(l.calls)], ["Prompt tokens", fmtInt(l.promptTokens)], ["Cached prompt tokens", fmtInt(l.cachedTokens)],
      ["Completion tokens", fmtInt(l.completionTokens)], ["LLM errors", fmtInt(l.errors)],
      ["Game event socket", st.socket.connected ? `connected · ${st.socket.events} events` : "off"], ["Panel port", c.port],
    ];
    patch($("#runtimeKv"), kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") + (l.lastError ? `<dt>Last LLM error</dt><dd class="bad">${esc(l.lastError)}</dd>` : ""));

    const tools = S.tools ?? [];
    const q = UI.toolQuery.trim().toLowerCase();
    const list = tools.filter(t => !q || `${t.name} ${t.description}`.toLowerCase().includes(q));
    $("#toolCount").textContent = `${list.length} of ${tools.length}`;
    const kindBadge = { read: "b-blue", action: "b-accent", internal: "b-cyan" };
    const order = { action: 0, read: 1, internal: 2 };
    patch($("#toolList"), list.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name)).map(t => {
      const open = UI.openTools.has(t.name);
      const props = Object.entries(t.input?.properties ?? {});
      const req = new Set(t.input?.required ?? []);
      return `<div class="tool-item"><div class="tool-head" data-act="toggle-tool" data-name="${esc(t.name)}" role="button" tabindex="0" aria-expanded="${open}">${icon("chevron", "caret")}<span class="mono">${esc(t.name)}</span><span class="tool-desc">${esc(t.description)}</span><span class="badge plain ${kindBadge[t.kind] ?? ""}">${esc(t.kind)}${t.rateCost ? ` · ${t.rateCost}` : ""}</span></div>
        ${open ? `<div class="tool-body"><div>${esc(t.description)}</div>${props.length ? `<div class="params">${props.map(([k, p]) => `<span class="mono">${esc(k)}</span><span class="muted">${esc(p.type ?? (p.enum ? "enum" : p.anyOf ? "union" : "any"))}${req.has(k) ? "" : "?"}</span><span>${esc(p.description ?? (p.enum ? p.enum.slice(0, 8).join(" | ") + (p.enum.length > 8 ? " …" : "") : ""))}</span>`).join("")}</div>` : '<div class="muted">no parameters</div>'}<div class="muted" style="font-size:12px">~${esc(t.rateCost)} API request${t.rateCost === 1 ? "" : "s"} per call</div></div>` : ""}</div>`;
    }).join("") || empty("No tools match."));
  },
};

async function setDirective(text) {
  try {
    const r = await post("/api/agent/directive", { text });
    toast(r.directive ? "Directive set — applies from the next wake" : "Directive cleared");
    $("#directiveInput") && ($("#directiveInput").value = "");
  } catch (err) { toast(`Could not set directive: ${err.message}`, true); }
  await load(["state"]); renderChrome(); VIEWS[UI.view].update();
}

async function togglePause() {
  const paused = S.state?.scheduler?.paused;
  try { await post(paused ? "/api/agent/resume" : "/api/agent/pause"); toast(paused ? "Resumed" : "Paused — scheduled wakes are held"); }
  catch (err) { toast(`Failed: ${err.message}`, true); }
  await load(["state"]); renderChrome(); VIEWS[UI.view].update();
}
async function wakeNow() {
  try { await post("/api/agent/wake", { reason: "manual wake from panel" }); toast("Wake requested"); }
  catch (err) { toast(`Failed: ${err.message}`, true); }
}

// ================================================================ interactions

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  switch (act) {
    case "range": UI.creditRange = Number(el.dataset.h); VIEWS.overview.update(); break;
    case "lb-tab": UI.lbTab = el.dataset.k; renderLeaderboard(); break;
    case "goto": location.hash = el.dataset.href; break;
    case "fleet-filter": UI.fleetFilter = el.dataset.k; VIEWS.fleet.update(); break;
    case "pick-wake": {
      const id = Number(el.dataset.id);
      history.replaceState(null, "", `#/activity/${id}`);
      UI.selWake = id;
      if (!S.wakeLog.has(id)) { VIEWS.activity.update(); await load(["wakeLog"]); }
      VIEWS.activity.update();
      break;
    }
    case "follow": UI.selWake = null; history.replaceState(null, "", "#/activity"); await load(["wakeLog"]); VIEWS.activity.update(); break;
    case "issues": UI.logIssues = !UI.logIssues; VIEWS.activity.update(); break;
    case "toggle-call": {
      const id = Number(el.dataset.id);
      UI.openCalls.has(id) ? UI.openCalls.delete(id) : UI.openCalls.add(id);
      VIEWS.activity.update();
      break;
    }
    case "select-wp": if (!el.closest("#mapSvg")) selectWp(el.dataset.wp); break;
    case "map-reset": UI.mapView = null; renderMap(); break;
    case "gal-select": e.preventDefault(); galSelect(el.dataset.sys, true); break;
    case "gal-open": openSystemMap(el.dataset.sys); break;
    case "gal-fit": UI.galView = null; drawGalaxy(); break;
    case "gal-fleet": galFleetView(); break;
    case "gal-zoom": if (galEnsureView()) { const { w, h } = galSize(); galZoomTo(UI.galView, UI.galView.scale * Number(el.dataset.f), w / 2, h / 2); drawGalaxy(); } break;
    case "open-market": UI.marketTab = "browse"; UI.marketSel = el.dataset.wp; break;
    case "market-tab": UI.marketTab = el.dataset.k; VIEWS.markets.update(); break;
    case "select-market": UI.marketSel = el.dataset.wp; VIEWS.markets.update(); await load(["history"]); VIEWS.markets.update(); break;
    case "complete-goal":
      try { await post(`/api/memory/goals/${encodeURIComponent(el.dataset.id)}/complete`); toast("Goal completed"); }
      catch (err) { toast(`Failed: ${err.message}`, true); }
      await load(["memory"]); VIEWS.memory.update(); renderChrome();
      break;
    case "note-kind": UI.noteKind = el.dataset.k; VIEWS.memory.update(); break;
    case "toggle-tool": {
      const n = el.dataset.name;
      UI.openTools.has(n) ? UI.openTools.delete(n) : UI.openTools.add(n);
      VIEWS.agent.update();
      break;
    }
    case "clear-directive": await setDirective(""); break;
    case "toggle-pause": await togglePause(); break;
    case "wake": await wakeNow(); break;
  }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
});
$("#btnPause").addEventListener("click", togglePause);
$("#btnWake").addEventListener("click", wakeNow);

// ================================================================ router

async function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const next = VIEWS[name] ? name : "overview";
  if (next === "activity") UI.selWake = arg ? Number(arg) || null : null;
  const changed = next !== UI.view || !view().childElementCount;
  UI.view = next;
  renderChrome();
  if (changed) { VIEWS[next].mount(); window.scrollTo(0, 0); }
  await load([...ALWAYS, ...VIEWS[next].needs]);
  renderChrome();
  VIEWS[next].update();
}
window.addEventListener("hashchange", route);

// ================================================================ live stream

const EVENT_RESOURCES = {
  ToolCalled: ["state", "activity", "wakeLog"],
  AgentWoke: ["state", "wakes", "activity", "wakeLog"],
  PlanUpdated: ["state", "activity", "wakeLog"],
  LoopSummary: ["state", "wakes", "activity", "wakeLog", "credits"],
  AgentSleeping: ["state"],
  Command: ["state"],
};

function resourcesFor(e) {
  if (e.type === "StateChanged") {
    const r = ["state"];
    for (const k of e.keys ?? []) {
      if (k === "agent") r.push("credits");
      else if (k.startsWith("market:")) r.push("markets", "history");
      else if (k === "fleet" || k.startsWith("system")) r.push("universe", "galaxy");
    }
    return r;
  }
  return EVENT_RESOURCES[e.type] ?? [];
}

let es = null;
function connect() {
  es?.close();
  es = new EventSource(`/api/events?since=${UI.lastEventAt}`);
  es.onopen = () => { UI.conn = "live"; renderLink(); renderChrome(); };
  es.onerror = () => {
    UI.conn = "lost";
    renderLink(); renderChrome();
    es.close();
    setTimeout(connect, 2500);
  };
  es.onmessage = ev => {
    let e;
    try { e = JSON.parse(ev.data); } catch { return; }
    UI.lastEventAt = Math.max(UI.lastEventAt, e.ts ?? 0);
    if (e.type === "RateBudgetChanged") {
      if (S.state) S.state.rate = { limit: e.limit, remaining: e.remaining, resetAt: e.resetAt };
      renderRate();
      return;
    }
    invalidate(resourcesFor(e));
  };
}

function renderLink() {
  const el = $("#link");
  el.className = `link ${UI.conn}`;
  $("#linkText").textContent = UI.conn === "live"
    ? `live · last event ${UI.lastEventAt ? fmtAgo(UI.lastEventAt) : "—"}`
    : UI.conn === "lost" ? "link lost — retrying" : "connecting…";
}

// ================================================================ ticker

setInterval(() => {
  const now = Date.now();
  for (const el of $$("[data-cd]")) {
    const at = Number(el.dataset.cd);
    el.textContent = at < now && el.dataset.ready ? el.dataset.ready : fmtCountdown(at);
  }
  for (const el of $$("[data-ago]")) el.textContent = fmtAgo(Number(el.dataset.ago));
  for (const el of $$("[data-elapsed]")) el.textContent = fmtDur(now - Number(el.dataset.elapsed));
  for (const el of $$("[data-prog-from]")) {
    const a = Number(el.dataset.progFrom), b = Number(el.dataset.progTo);
    el.style.width = `${Math.max(0, Math.min(100, ((now - a) / (b - a || 1)) * 100)).toFixed(2)}%`;
  }
  for (const el of $$("[data-mv]")) {
    const [x0, y0, x1, y1, t0, t1] = el.dataset.mv.split(",").map(Number);
    const f = Math.max(0, Math.min(1, (now - t0) / (t1 - t0 || 1)));
    el.setAttribute("transform", `translate(${x0 + (x1 - x0) * f} ${y0 + (y1 - y0) * f})`);
  }
  // ships crossing between systems move along their line on the galaxy canvas
  if (UI.view === "galaxy" && !document.hidden && galaxyFleet().moving.length) galRedraw();
  renderLink();
}, 1000);

// Safety net: a missed event never leaves the panel stale for long.
setInterval(() => { if (UI.conn === "live") invalidate(["state"]); }, 30_000);

let resizeT = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (UI.view === "overview") VIEWS.overview.update();
    if (UI.view === "map") { UI.mapView = null; renderMap(); }
    if (UI.view === "galaxy") drawGalaxy();
  }, 150);
});

route();
connect();
