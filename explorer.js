(async function () {
"use strict";
const response = await fetch("./explorer_data.json");
if (!response.ok) throw new Error(`Unable to load explorer data: HTTP ${response.status}`);
const D = await response.json();
const P = D.passages, IV = D.interviews, CODES = D.codes;
const COLL = { tucker: "Tucker County", stonewall: "Stonewall Jackson Dam", grundy: "Grundy" };
const COLL_ORDER = ["tucker", "stonewall", "grundy"];
const $ = (s, el) => (el || document).querySelector(s);
const view = $("#view");
const state = { tab: "questions", q: "Q1", card: null, cardUser: "All", place: null, placeFilter: "", code: 0,
                topic: null, interview: null, search: "", searchColl: "all", reader: null, readerCode: null,
                zoom: "region", unconfirmed: false, cardKind: null, cardColl: null, cardWhere: null, cardText: "", cardQ: null };

/* ---------- helpers ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d) {
  if (!d) return "date unknown";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : String(d).slice(0, 4);
}
const year = iv => (iv.date || "").slice(0, 4);
function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function marked(text, ranges) {
  // ranges: [start, end, cls]; earlier-starting ranges win overlaps
  ranges = ranges.filter(r => r[1] > r[0]).sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let out = "", pos = 0;
  for (const [s, e, cls] of ranges) {
    if (s < pos) continue;
    const seg = text.slice(s, e);
    const open = cls === "mark" ? "<mark>" : cls === "plc" ? `<a class="plc" href="#places" data-goplace="${esc(seg)}" title="Show ${esc(seg)} in Places">` : `<span class="${cls}">`;
    const close = cls === "mark" ? "</mark>" : cls === "plc" ? "</a>" : "</span>";
    out += esc(text.slice(pos, s)) + open + esc(seg) + close;
    pos = e;
  }
  return out + esc(text.slice(pos));
}
function findAll(text, re) {
  const out = []; if (!re) return out; re.lastIndex = 0; let m;
  while ((m = re.exec(text))) { out.push([m.index, m.index + m[0].length]); if (m[0].length === 0) re.lastIndex++; }
  return out;
}
// Every confirmed place name (gazetteer-located or shaped like a place) becomes a link to the Places tab
let PLACE_RE = null;
function placeRe() {
  if (PLACE_RE) return PLACE_RE;
  const names = D.places.filter(p => p.ok && p.person < 0.5).map(p => p.name).sort((a, b) => b.length - a.length);
  PLACE_RE = names.length ? new RegExp("(?<![\\w'])(?:" + names.map(reEsc).join("|") + ")(?![\\w'])", "g") : null;
  return PLACE_RE;
}
const placeRanges = text => findAll(text, placeRe()).map(r => [...r, "plc"]);
const linkify = text => marked(text, placeRanges(text));
function excerpt(text, n, focus) {
  if (text.length <= n) return [text, 0];
  let start = 0;
  if (focus != null && focus > n * 0.6) start = Math.max(0, focus - Math.floor(n * 0.35));
  if (start > 0) { const sp = text.indexOf(" ", start); start = sp > 0 ? sp + 1 : start; }
  let end = Math.min(text.length, start + n);
  if (end < text.length) { const sp = text.lastIndexOf(" ", end); end = sp > start ? sp : end; }
  return [(start > 0 ? "… " : "") + text.slice(start, end) + (end < text.length ? " …" : ""), start > 0 ? start - 2 : 0];
}
function evidenceRange(pi, k) {
  const ev = D.evidence[pi + ":" + k]; if (!ev) return null;
  const t = P[pi].t, s = t.indexOf(ev.trim());
  return s >= 0 ? [s, s + ev.trim().length] : null;
}
function termRe(q) {
  q = q.trim(); if (!q) return null;
  const phrase = /^".+"$/.test(q);
  const terms = phrase ? [q.slice(1, -1)] : q.split(/\s+/).filter(Boolean);
  return { terms, all: terms.map(t => new RegExp("(?<![\\w'])" + reEsc(t).replace(/\\\*$/, "\\w*") + (t.endsWith("*") ? "" : "(?![\\w'])"), "gi")) };
}
const codeChip = (k, on) => `<button class="chip${on ? " on" : ""}" data-code="${k}" title="${esc(CODES[k].label)}"><span class="cid">${CODES[k].id}</span>${esc(CODES[k].short)}</button>`;
function ivLine(iv, extra) {
  return `<span class="dot ${iv.coll}"></span><b>${esc(iv.name)}</b><span>${COLL[iv.coll]}</span><span class="mono">${esc(year(iv) || "n.d.")}</span>${extra || ""}`;
}
function pitem(pi, opts) {
  opts = opts || {};
  const p = P[pi], iv = IV[p.i];
  let focus = null, ranges = [];
  if (opts.re) { for (const r of opts.re.all) ranges = ranges.concat(findAll(p.t, r).map(x => [...x, "mark"])); }
  if (opts.code != null) { const r = evidenceRange(pi, opts.code); if (r) ranges.push([...r, "mark"]); }
  if (opts.place) { ranges = ranges.concat(findAll(p.t, new RegExp("(?<![\\w'])" + reEsc(opts.place) + "(?![\\w'])", "g")).map(x => [...x, "mark"])); }
  if (ranges.length) focus = Math.min(...ranges.map(r => r[0]));
  else if (opts.placeFocus) { const pr = placeRanges(p.t); if (pr.length) focus = pr[0][0]; }
  const [ex, off] = excerpt(p.t, opts.len || 330, focus);
  const shifted = ranges.map(([s, e, c]) => [s - off, e - off, c]).filter(([s, e]) => s >= 0 && e <= ex.length);
  const exHtml = marked(ex, shifted.concat(placeRanges(ex)));
  const rank = opts.rank != null ? `<span class="rank">${opts.rank}</span>` : "";
  const nOf = `<span class="mono">passage ${p.s + 1} of ${iv.n}</span>`;
  const tags = opts.tags === false ? "" : `<div class="ptags">${p.c.slice(0, 6).map(k => codeChip(k, k === opts.code)).join("")}</div>`;
  return `<article class="pitem" tabindex="0" role="button" data-p="${pi}" data-code="${opts.code != null ? opts.code : ""}">
    <div class="pmeta">${rank}${ivLine(iv, nOf)}</div><p class="ptext">${exHtml}</p>${tags}</article>`;
}
function plist(ids, opts, limit) {
  limit = Math.max(limit || 40, state.limit || 0);
  if (!ids.length) return `<p class="empty">No passages.</p>`;
  const shown = ids.slice(0, limit);
  let h = `<div class="plist">${shown.map((pi, k) => pitem(pi, { ...opts, rank: opts && opts.ranked ? k + 1 : null })).join("")}</div>`;
  if (ids.length > limit) h += `<button class="btn more" data-more="${limit + 60}">Show ${Math.min(60, ids.length - limit)} more of ${ids.length - limit}</button>`;
  return h;
}

/* ---------- tabs ---------- */
const TABS = [["questions", "Questions", D.questions.length], ["cards", "Field cards", D.cards.length], ["places", "Places", null],
              ["codes", "Codes", CODES.length], ["map", "Meaning map", null], ["interviews", "Interviews", IV.length]];
function renderTabs() {
  const t = TABS.slice(); if (state.search) t.push(["search", "Search results", null]);
  $("#tabs").innerHTML = t.map(([id, label, n]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${label}${n != null ? `<span class="ct">${n}</span>` : ""}</button>`).join("");
}
function go(tab, push) {
  state.tab = tab; state.limit = 0; renderTabs(); render();
  if (push !== false && tab !== "search") { try { history.replaceState(null, "", "#" + tab); } catch (e) {} }
  window.scrollTo({ top: 0 });
}

/* ---------- views ---------- */
function vQuestions() {
  const users = [...new Set(D.questions.map(q => q.user))];
  const Q = D.questions.find(q => q.id === state.q) || D.questions[0];
  const side = users.map(u => `<div class="qgroup"><h3>${esc(u)}</h3>${D.questions.filter(q => q.user === u).map(q =>
    `<button class="qbtn${q.id === Q.id ? " on" : ""}" data-q="${q.id}">${esc(q.q)}</button>`).join("")}</div>`).join("");
  const cardLinks = Q.cards.length ? `<div class="cardlinks"><button class="btn" data-qcards="${Q.id}">${Q.cards.length} field cards on this question →</button></div>` : "";
  return `<p class="eyebrow">Ask the archive</p>
    <p class="lede">Questions people in operations would ask, answered with the passages that match best. Each answer links to the full interview, so you can read it in context and judge it yourself.</p>
    <div class="cols"><div class="side" id="qside">${side}</div>
    <section aria-live="polite"><div class="qhead"><span class="eyebrow">${esc(Q.user)}</span><h2>${esc(Q.q)}</h2>
      <p class="method">Top ${Q.p.length} passages by ${esc(D.meta.method)}. Machine-ranked, not reviewed.</p>${cardLinks}</div>
      ${plist(Q.p, { ranked: true }, 20)}</section></div>`;
}

function cardFilter() {
  const f = state.cardText.trim().toLowerCase();
  const qset = state.cardQ ? new Set((D.questions.find(q => q.id === state.cardQ) || { cards: [] }).cards) : null;
  return D.cards.filter(c => (state.cardUser === "All" || c.users.includes(state.cardUser)) &&
    (!state.cardKind || c.kind === state.cardKind) && (!state.cardColl || c.colls.includes(state.cardColl)) &&
    (!state.cardWhere || c.where === state.cardWhere) && (!qset || qset.has(c.id)) &&
    (!f || (c.title + " " + c.place + " " + c.note + " " + c.quotes.map(q => q.text + " " + q.speaker).join(" ")).toLowerCase().includes(f)));
}
function cardMatrix() {
  const kinds = {};
  D.cards.forEach(c => { const k = kinds[c.kind] = kinds[c.kind] || { n: 0, c: { tucker: 0, stonewall: 0, grundy: 0 } }; k.n++; c.colls.forEach(x => k.c[x]++); });
  const rows = Object.entries(kinds).sort((a, b) => b[1].n - a[1].n);
  const max = Math.max(...rows.flatMap(([, v]) => Object.values(v.c)));
  const cell = (kind, coll, n) => `<td class="mx${state.cardKind === kind && state.cardColl === coll ? " on" : ""}" data-mkind="${esc(kind)}" data-mcoll="${coll}" style="--a:${(0.08 + 0.72 * n / max).toFixed(2)}${n / max > 0.55 ? ";color:var(--accent-ink)" : ""}" title="${n} ${esc(kind)} cards, ${COLL[coll]}">${n || ""}</td>`;
  return `<table class="matrix"><thead><tr><th></th>${COLL_ORDER.map(c => `<th><i class="dot ${c}"></i> ${COLL[c].split(" ")[0]}</th>`).join("")}<th>All</th></tr></thead>
    <tbody>${rows.map(([k, v]) => `<tr><th scope="row"><button class="mxk${state.cardKind === k && !state.cardColl ? " on" : ""}" data-mkind="${esc(k)}" data-mcoll="">${esc(k)}</button></th>${COLL_ORDER.map(c => cell(k, c, v.c[c])).join("")}<td class="n">${v.n}</td></tr>`).join("")}</tbody></table>`;
}
function cardMap() {
  const B = D.basemap, study = new Set(["54093", "54041", "51027"]);
  const groups = {};
  D.cards.forEach(c => { const key = c.xy.join(",") + c.approx; const g = groups[key] = groups[key] || { xy: c.xy, where: c.where, approx: c.approx, n: 0, coll: {} }; g.n++; c.colls.forEach(x => g.coll[x] = (g.coll[x] || 0) + 1); });
  const gs = Object.values(groups).sort((a, b) => b.n - a.n);
  const panel = key => {
    const vb = zoomBox(key), z = B.w / vb[2], k = vb[2] / 400, fs = 13 * k;
    const inV = (x, y) => x >= vb[0] && x <= vb[0] + vb[2] && y >= vb[1] && y <= vb[1] + vb[3];
    const mine = gs.filter(g => inV(g.xy[0], g.xy[1]));
    const counties = B.counties.map(c => `<path class="county${study.has(c.fips) ? " study" : ""}" d="${c.d}" vector-effect="non-scaling-stroke"></path>`).join("");
    const rad = g => (3 + 2.6 * Math.sqrt(g.n)) * k;
    const dots = mine.slice().reverse().map(g => { const top = Object.entries(g.coll).sort((a, b) => b[1] - a[1])[0][0];
      return `<circle class="cmark${state.cardWhere === g.where ? " sel" : ""}" data-cwhere="${esc(g.where)}" cx="${g.xy[0]}" cy="${g.xy[1]}" r="${rad(g).toFixed(2)}" fill="${g.approx ? "none" : `var(--c-${top})`}" stroke="${g.approx ? `var(--c-${top})` : "var(--surface)"}" vector-effect="non-scaling-stroke"><title>${esc(g.where)}: ${g.n} card${g.n === 1 ? "" : "s"}${g.approx ? " (placed at the interview location)" : ""}</title></circle>`; }).join("");
    const placed = []; let labels = "";
    for (const g of mine.filter(g => !g.approx)) {
      const t = `${g.where} ${g.n}`, w = t.length * fs * 0.5, r = rad(g);
      for (const [x, anchor] of [[g.xy[0] + r + fs * 0.3, "start"], [g.xy[0] - r - fs * 0.3, "end"]]) {
        const x0 = anchor === "start" ? x : x - w, y = g.xy[1] + fs * 0.35;
        if (x0 < vb[0] + 2 || x0 + w > vb[0] + vb[2] - 2 || placed.some(b => x0 < b[0] + b[2] && x0 + w > b[0] && Math.abs(y - b[1]) < fs * 1.1)) continue;
        placed.push([x0, y, w]); labels += `<text class="maplabel" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" style="font-size:${fs.toFixed(2)}px">${esc(g.where)} <tspan style="font-family:var(--f-mono);fill:var(--muted)">${g.n}</tspan></text>`; break;
      }
    }
    const n = mine.reduce((a, g) => a + g.n, 0);
    return `<figure class="kmini"><figcaption><i class="dot ${key}"></i> ${COLL[key]} <span class="mono">${n}</span></figcaption><svg viewBox="${vb.map(v => v.toFixed(1)).join(" ")}" role="img" aria-label="Field cards around ${COLL[key]}">${counties}${dots}${labels}</svg></figure>`;
  };
  return `<div class="kminis">${COLL_ORDER.map(panel).join("")}</div>`;
}
function vCards() {
  const users = ["All", ...new Set(D.cards.flatMap(c => c.users))];
  const list = cardFilter();
  const filters = [];
  if (state.cardQ) filters.push(["cardQ", "Question: " + (D.questions.find(q => q.id === state.cardQ) || {}).q]);
  if (state.cardKind) filters.push(["cardKind", state.cardKind]);
  if (state.cardColl) filters.push(["cardColl", COLL[state.cardColl]]);
  if (state.cardWhere) filters.push(["cardWhere", state.cardWhere]);
  const card = c => `<article class="kcard${state.card === c.id ? " hl" : ""}" id="card-${c.id}">
      <div class="khead"><span class="kind">${esc(c.kind)}</span><span style="display:inline-flex;gap:4px;align-items:center">${c.colls.map(k => `<i class="dot ${k}" title="${COLL[k]}"></i>`).join("")}<span class="mono">${c.id}</span></span></div>
      <h3>${linkify(c.title)}</h3>
      <div class="kplace">${linkify(c.place)} <span class="mono">· ${esc(c.event)}</span></div>
      ${c.quotes.map(q => { const iv = IV[P[q.p].i]; return `<blockquote class="quote">“${linkify(q.text)}”<footer>${esc(q.speaker)}, ${COLL[iv.coll]}, ${esc(year(iv) || "n.d.")} · <button data-p="${q.p}">read in context</button></footer></blockquote>`; }).join("")}
      <div class="kfield"><b>Analyst note.</b> ${linkify(c.note)}</div>
      <div class="kfield"><b>Check against.</b> ${esc(c.verify)}</div>
      <div class="kask"><b>Ask a floodplain manager next</b>${esc(c.ask_next)}</div>
      <div class="kfoot">${c.users.map(u => `<span class="chip">${esc(u)}</span>`).join("")}<span class="flag">Analyst draft, not reviewed</span></div>
    </article>`;
  let grid;
  if (state.cardKind || list.length < 12) grid = `<div class="cardgrid">${list.map(card).join("")}</div>`;
  else {
    const by = {}; list.forEach(c => (by[c.kind] = by[c.kind] || []).push(c));
    grid = Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([k, cs]) => `<section class="kgroup"><h2>${esc(k)} <span class="mono">${cs.length}</span></h2><div class="cardgrid">${cs.map(card).join("")}</div></section>`).join("");
  }
  const nq = D.cards.reduce((a, c) => a + c.quotes.length, 0), niv = new Set(D.cards.flatMap(c => c.quotes.map(q => P[q.p].i))).size;
  return `<p class="eyebrow">Field cards</p>
    <p class="lede">Working knowledge pulled from the transcripts, one card per lesson: a place, what happened there, the narrator's exact words, what to check it against, and the question a floodplain-manager interview should ask next. These are the records an operational archive would hold.</p>
    <div class="kstats"><div><b class="num">${D.cards.length}</b><span>cards</span></div><div><b class="num">${nq}</b><span>verified quotes</span></div><div><b class="num">${niv}</b><span>of ${IV.length} interviews cited</span></div><div><b class="num">${new Set(D.cards.filter(c => !c.approx).map(c => c.where)).size}</b><span>places</span></div></div>
    <div class="kover"><div class="mapbox"><div class="kpanel"><span class="eyebrow">Where the cards are</span><p class="method">Click a place to filter. Circles are sized by cards; hollow ones are placed at the interview location.</p></div>${cardMap()}</div>
      <div class="mapbox kmx"><div class="kpanel"><span class="eyebrow">By kind and collection</span><p class="method">Click a cell to filter.</p></div><div class="stripscroll" style="padding:0 10px">${cardMatrix()}</div></div></div>
    <div class="filters"><span class="eyebrow">Who uses it</span>${users.map(u => `<button class="chip${state.cardUser === u ? " on" : ""}" data-cuser="${esc(u)}">${esc(u)}</button>`).join("")}</div>
    <div class="filters"><input class="filterbox" id="cardtext" type="search" placeholder="Filter cards by word, place or narrator" value="${esc(state.cardText)}" aria-label="Filter cards" style="max-width:380px;margin:0">
      ${filters.map(([k, l]) => `<button class="chip on" data-clear="${k}">${esc(l)} ✕</button>`).join("")}${filters.length ? `<button class="chip" data-clear="all">Clear all</button>` : ""}</div>
    <p class="method">${list.length} of ${D.cards.length} cards. Every quote is verified word for word against its transcript; the build refuses a card whose quote does not match.</p>
    ${grid}`;
}

function zoomBox(key) {
  const B = D.basemap;
  if (key === "place") {
    const sp = D.places.find(p => p.name === state.place);
    if (sp && sp.loc && sp.loc.xy) { const w = 260, h = w * B.h / B.w, [cx, cy] = sp.loc.xy;
      return [Math.max(0, Math.min(B.w - w, cx - w / 2)), Math.max(0, Math.min(B.h - h, cy - h / 2)), w, h]; }
    key = "region";
  }
  if (key === "region") return [0, 0, B.w, B.h];
  const pts = IV.filter(iv => iv.coll === key && !iv.flag).map(iv => iv.xy);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const w = 300, h = w * B.h / B.w;
  return [Math.max(0, Math.min(B.w - w, cx - w / 2)), Math.max(0, Math.min(B.h - h, cy - h / 2)), w, h];
}
function mapSvg() {
  const B = D.basemap, study = new Set(["54093", "54041", "51027"]);
  const vb = zoomBox(state.zoom), z = B.w / vb[2], fs = 14 / z;
  const inView = (x, y) => x >= vb[0] && x <= vb[0] + vb[2] && y >= vb[1] && y <= vb[1] + vb[3];
  const counties = B.counties.map(c => `<path class="county${study.has(c.fips) ? " study" : ""}" d="${c.d}" vector-effect="non-scaling-stroke"><title>${esc(c.name)} County, ${c.state}</title></path>`).join("");
  const placed = [];   // label boxes already drawn, for collision checks
  const fits = (x, y, w, h) => {
    if (x < vb[0] + 2 || x + w > vb[0] + vb[2] - 2 || y - h < vb[1] + 2 || y > vb[1] + vb[3] - 2) return false;
    if (placed.some(b => x < b[0] + b[2] && x + w > b[0] && y - h < b[1] && y > b[1] - b[3])) return false;
    placed.push([x, y, w, h]); return true;
  };
  const tw = t => t.length * fs * 0.52;
  let sl = "";
  for (const l of (B.labels || [])) {
    const f = l.kind === "state" ? fs * 1.05 : fs * 0.95, w = l.text.length * f * (l.kind === "state" ? 0.8 : 0.5);
    if (inView(l.x, l.y) && fits(l.x - w / 2, l.y, w, f)) sl += `<text class="maplabel ${l.kind}" x="${l.x}" y="${l.y}" text-anchor="middle" style="font-size:${f.toFixed(2)}px">${esc(l.text)}</text>`;
  }
  const located = D.places.filter(p => p.loc && p.loc.xy && p.loc.cls !== "County").sort((a, b) => b.n - a.n);
  const rad = p => (3.5 + 2.2 * Math.sqrt(p.n)) / Math.sqrt(z);
  const pts = located.slice().reverse().map(p => `<circle class="ptmark${state.place === p.name ? " sel" : ""}" data-place="${esc(p.name)}" cx="${p.loc.xy[0]}" cy="${p.loc.xy[1]}" r="${rad(p).toFixed(2)}" fill="var(--c-${p.loc.coll})" fill-opacity=".8" vector-effect="non-scaling-stroke"></circle>`).join("");
  let labels = "";
  for (const p of located) {
    if (!inView(p.loc.xy[0], p.loc.xy[1])) continue;
    const r = rad(p), w = tw(p.name), y = p.loc.xy[1] + fs * 0.35;
    if (fits(p.loc.xy[0] + r + fs * 0.25, y, w, fs)) labels += `<text class="maplabel" x="${(p.loc.xy[0] + r + fs * 0.25).toFixed(1)}" y="${y.toFixed(1)}" style="font-size:${fs.toFixed(2)}px">${esc(p.name)}</text>`;
    else if (fits(p.loc.xy[0] - r - fs * 0.25 - w, y, w, fs)) labels += `<text class="maplabel" x="${(p.loc.xy[0] - r - fs * 0.25).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="end" style="font-size:${fs.toFixed(2)}px">${esc(p.name)}</text>`;
  }
  const groups = {};
  IV.forEach((iv, k) => { const key = iv.xy.join(","); (groups[key] = groups[key] || { xy: iv.xy, coll: iv.coll, ivs: [] }).ivs.push(k); });
  const s = 5 / Math.sqrt(z);
  const ivm = Object.values(groups).map(g => `<rect class="ivmark" data-ivs="${g.ivs.join(",")}" x="${g.xy[0] - s}" y="${g.xy[1] - s}" width="${2 * s}" height="${2 * s}" transform="rotate(45 ${g.xy[0]} ${g.xy[1]})" fill="var(--c-${g.coll})" vector-effect="non-scaling-stroke"></rect>`).join("");
  return `<svg viewBox="${vb.map(v => v.toFixed(1)).join(" ")}" role="img" aria-label="Map of places narrators named and where interviews were recorded">${counties}<g>${ivm}</g><g>${pts}</g>${sl}<g>${labels}</g></svg>`;
}
function vPlaces() {
  const f = state.placeFilter.toLowerCase();
  const nUnc = D.places.filter(p => !p.ok).length;
  const vb = zoomBox(state.zoom), zoomed = state.zoom !== "region";
  const inVb = p => p.loc && p.loc.xy && p.loc.xy[0] >= vb[0] && p.loc.xy[0] <= vb[0] + vb[2] && p.loc.xy[1] >= vb[1] && p.loc.xy[1] <= vb[1] + vb[3];
  const rows = D.places.filter(p => (state.unconfirmed || p.ok) && (!f || p.name.toLowerCase().includes(f)) && (!zoomed || inVb(p)));
  const nLoc = D.places.filter(p => p.loc).length;
  const sel = D.places.find(p => p.name === state.place);
  const flagged = IV.filter(iv => iv.flag);
  const row = p => `<div class="plrow${state.place === p.name ? " on" : ""}" data-place="${esc(p.name)}" tabindex="0" role="button">
     <span class="nm">${esc(p.name)}</span><span class="n">${p.n}</span>
     <span class="sub">${p.loc ? (p.loc.cls === "County" ? `County outline, ${esc(p.loc.state)}` : `Located: ${esc(p.loc.county)}${/county|city/i.test(p.loc.county) ? "" : " County"}, ${esc(p.loc.state)}${p.loc.xy ? "" : " (off this map)"}`) : `Not located: ${esc(p.why)}`}${p.person >= 0.5 ? " · mostly a person's name" : p.person >= 0.15 ? " · sometimes a surname" : ""} · found by ${esc(p.how)} · ${p.iv} interview${p.iv === 1 ? "" : "s"}</span></div>`;
  const pc = sel ? D.cards.filter(c => c.where === sel.name || new RegExp("(?<![\\w'])" + reEsc(sel.name) + "(?![\\w'])").test(c.place)) : [];
  const detail = sel ? `<button class="btn" data-place="${esc(sel.name)}">← All places${zoomed ? " in this view" : ""}</button>
      <div style="margin-top:12px"><span class="eyebrow">Passages naming</span><h2 style="font-size:24px;font-weight:600">${esc(sel.name)}</h2>
      <p class="method">${sel.n} passages in ${sel.iv} interview${sel.iv === 1 ? "" : "s"}. ${sel.loc ? (sel.loc.xy ? `On the map: ${esc(sel.loc.county)}${sel.loc.cls === "County" ? " County" : ""}, ${esc(sel.loc.state)}.` : `Located in ${esc(sel.loc.state)}, outside this map.`) : `Not on the map yet (${esc(sel.why)}). With GNIS loaded, creeks, runs and small places like this get coordinates.`}</p>
      ${pc.length ? `<div class="cardlinks wrapchips"><span class="eyebrow">Field cards here · ${pc.length}</span>${pc.slice(0, 6).map(c => `<button class="chip" data-gocard="${c.id}">${esc(c.title)}</button>`).join("")}${pc.length > 6 ? `<button class="chip on" data-allcards="${esc(sel.name)}">All ${pc.length} cards here →</button>` : ""}</div>` : ""}
      ${plist(sel.p, { place: sel.name, len: 240, tags: false }, 25)}</div>` : "";
  // when zoomed in with nothing selected: the passages that name any place in view, most-cited places first
  let viewList = !zoomed && !sel ? `<p class="method" style="margin-top:12px">Click a place on the map or in the list to read what narrators said about it, or zoom in to see every passage naming a place on screen.</p>` : "";
  if (zoomed && !sel) {
    const hits = new Map();   // passage -> number of on-screen places it names
    rows.filter(p => p.ok).forEach(p => p.p.forEach(i => hits.set(i, (hits.get(i) || 0) + 1)));
    const ids = [...hits.keys()].sort((x, y) => hits.get(y) - hits.get(x) || x - y);
    viewList = `<div style="margin-top:22px"><span class="eyebrow">Passages naming places in this view</span>
      <p class="method">${ids.length} passages name one of the ${rows.length} places on screen. Place names are links; click one, or a point on the map, to narrow to that place.</p>
      ${plist(ids, { placeFocus: true }, 20)}</div>`;
  }
  return `<p class="eyebrow">Places</p>
    <p class="lede">Floodplain managers think by place, so place is the main way in. Names come from the transcripts, are looked up in a gazetteer and placed near the interview where a name exists in more than one state.</p>
    <div class="cols places">
      <div><div class="filters" style="margin-top:0;margin-bottom:10px"><span class="eyebrow">Zoom</span>${[["region", "Whole region"], ["tucker", COLL.tucker], ["stonewall", "Lewis County"], ["grundy", COLL.grundy]].concat(sel && sel.loc && sel.loc.xy ? [["place", "This place: " + sel.name]] : []).map(([k, l]) => `<button class="chip${state.zoom === k ? " on" : ""}" data-zoom="${k}">${l}</button>`).join("")}</div>
        <div class="mapbox">${mapSvg()}
        <div class="mapfoot"><div class="legend">${COLL_ORDER.map(c => `<span><i class="dot ${c}"></i>${COLL[c]}</span>`).join("")}<span>◆ interview location</span><span>● place named, sized by passages</span></div>
        <span>${esc(D.meta.gazetteer)}</span></div></div>
        ${viewList}
        ${flagged.length ? `<div style="margin-top:22px"><span class="eyebrow">Interview locations to check</span>
          <p class="method">${flagged.length} Voices records place an interview more than 100 km from the rest of its collection. The map uses the collection's center for these.</p>
          <div class="ptags">${flagged.map(iv => `<button class="chip" data-iv="${IV.indexOf(iv)}">${esc(iv.name)} · ${esc(iv.city)} · ${iv.km} km</button>`).join("")}</div></div>` : ""}
      </div>
      <div class="side" id="placeside">${sel ? detail : `<span class="eyebrow">${zoomed ? `${rows.length} places in this view` : `${D.places.length - nUnc} place names · ${nLoc} located`}</span>
        <div class="filters" style="margin-top:8px"><button class="chip${state.unconfirmed ? " on" : ""}" data-unc="1">Include ${nUnc} unconfirmed names</button></div>
        <p class="method">Unconfirmed: names only the recognizer proposed and no gazetteer could place. Many are surnames.</p>
        <input class="filterbox" id="placefilter" type="search" placeholder="Filter places" value="${esc(state.placeFilter)}" aria-label="Filter places">
        <div id="plrows">${rows.slice(0, 150).map(row).join("")}</div>`}</div>
    </div>`;
}

function vCodes() {
  const k = state.code, C = CODES[k];
  const side = CODES.map((c, j) => `<button class="crow${j === k ? " on" : ""}" data-codesel="${j}"><span class="l1"><span class="cid">${c.id}</span><span class="cn">${esc(c.short)}</span>${c.status === "candidate" ? `<span class="chip">candidate</span>` : ""}</span>
      <span class="l2 num">${c.p.length} passages · ${c.iv} interviews</span></button>`).join("");
  return `<p class="eyebrow">Codes</p>
    <p class="lede">The draft flood codebook (${esc(D.meta.codebook)}), applied by its search words. Each passage shows the sentence that matched. Treat these as leads: the codes are out for review and nothing has been double-coded yet.</p>
    <div class="cols"><div class="side">${side}</div>
    <section><span class="eyebrow">${C.id} · ${esc(C.offices.join(", "))}${C.status === "candidate" ? " · candidate code" : ""}</span><h2 style="font-size:26px;font-weight:600">${esc(C.label)}</h2>
      <div class="defbox"><div><b>Definition.</b> ${esc(C.def)}</div><div><b>Include.</b> ${esc(C.inc)}</div><div><b>Exclude.</b> ${esc(C.exc)}</div></div>
      <p class="method">${C.p.length} passages matched by search words, unvalidated.</p>
      ${plist(C.p, { code: k }, 30)}</section></div>`;
}

function vMap() {
  const T = D.topics, sel = state.topic;
  const W = 1000, H = 760, pad = 24;
  const X = v => pad + v * (W - 2 * pad), Y = v => pad + (1 - v) * (H - 2 * pad);
  const pts = P.map((p, i) => `<circle class="pt${sel != null && p.tp !== sel ? " dim" : ""}" data-p="${i}" cx="${X(p.xy[0]).toFixed(1)}" cy="${Y(p.xy[1]).toFixed(1)}" r="3.4" fill="var(--c-${IV[p.i].coll})"></circle>`).join("");
  const big = T.filter(t => t.n >= 40 && t.spread < 0.08).slice(0, 12);
  const short = l => l.split(", ").slice(0, 2).join(", ");
  const labels = (sel != null ? T.filter(t => t.t === sel) : big).map(t => `<text class="tlabel" x="${Math.min(W - 90, Math.max(90, X(t.xy[0]))).toFixed(0)}" y="${Y(t.xy[1]).toFixed(0)}" text-anchor="middle">${esc(short(t.label))}</text>`).join("");
  const rows = T.map(t => { const tot = t.c.reduce((a, b) => a + b, 0);
    return `<div class="trow${sel === t.t ? " on" : ""}" data-topic="${t.t}" tabindex="0" role="button"><span class="tid">${t.t}</span><span class="tl">${esc(t.label.split(", ").slice(0, 4).join(", "))}</span>
      <span class="mbar" title="${t.c.map((n, j) => COLL[COLL_ORDER[j]] + " " + n).join(", ")}">${t.c.map((n, j) => n ? `<i style="width:${(100 * n / tot).toFixed(0)}%;background:var(--c-${COLL_ORDER[j]})"></i>` : "").join("")}</span></div>`; }).join("");
  const tsel = T.find(t => t.t === sel);
  const list = tsel ? `<div style="margin-top:20px"><span class="eyebrow">Topic ${tsel.t} · ${tsel.n} passages</span><h2 style="font-size:22px;font-weight:600">${esc(tsel.label)}</h2>
      ${plist(P.map((p, i) => p.tp === sel ? i : -1).filter(i => i >= 0), {}, 20)}</div>` : "";
  return `<p class="eyebrow">Meaning map</p>
    <p class="lede">Every passage placed by meaning: passages that say similar things sit close together. Labels are BERTopic's word lists for the larger topics, not names anyone has agreed on. Hover a point to read it, click to open it.</p>
    <div class="mm"><div><div class="mapbox"><svg id="mmsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of passages by meaning, colored by collection">${pts}${labels}</svg>
      <div class="mapfoot"><div class="legend">${COLL_ORDER.map(c => `<span><i class="dot ${c}"></i>${COLL[c]}</span>`).join("")}</div><span>${esc(D.meta.embedding || "")} · UMAP</span></div></div>${list}</div>
    <div class="side"><span class="eyebrow">${T.length} topics · ${Math.round(100 * D.meta.outliers)}% of passages in none</span><div style="margin-top:8px">${sel != null ? `<button class="btn" data-topic="clear" style="margin-bottom:8px">Show all topics</button>` : ""}${rows}</div></div></div>`;
}

function vInterviews() {
  if (state.interview != null) return vInterview(state.interview);
  const rows = IV.map((iv, k) => ({ iv, k })).sort((a, b) => COLL_ORDER.indexOf(a.iv.coll) - COLL_ORDER.indexOf(b.iv.coll) || (a.iv.date || "9").localeCompare(b.iv.date || "9"));
  return `<p class="eyebrow">Interviews</p>
    <p class="lede">All ${IV.length} transcripts. Open one to read it start to finish, with an index of where each theme comes up.</p>
    <div class="tablewrap"><table><thead><tr><th>Narrator</th><th>Collection</th><th>Recorded</th><th>Voices location</th><th style="text-align:right">Passages</th><th>Text</th></tr></thead>
    <tbody>${rows.map(({ iv, k }) => `<tr data-iv="${k}" tabindex="0"><td><b>${esc(iv.name)}</b></td><td><span class="dot ${iv.coll}"></span> ${COLL[iv.coll]}</td>
      <td class="mono">${esc(fmtDate(iv.date))}</td><td>${esc(iv.city)}${iv.flag ? ` <span class="flag" title="${iv.km} km from the rest of its collection">check</span>` : ""}</td>
      <td class="n">${iv.n}</td><td>${iv.ocr ? `<span class="flag" title="Text came from OCR of a typescript">OCR</span>` : "typed"}</td></tr>`).join("")}</tbody></table></div>`;
}
function stripSvg(k) {
  const S = D.strips[k], n = S.order.length;
  const rows = S.rows.map((r, j) => ({ r, j })).filter(x => /[13]/.test(x.r));
  const cw = Math.max(9, Math.min(18, 900 / n)), lw = 196, rh = 20, top = 22;
  const W = lw + cw * n + 10, H = top + rh * rows.length + 6;
  let g = "";
  for (let c = 0; c < n; c++) {
    const x = lw + c * cw;
    g += `<line class="tick" x1="${x + cw / 2}" x2="${x + cw / 2}" y1="${c % 10 === 0 ? 4 : 12}" y2="16" stroke-width="${c % 10 === 0 ? 1.4 : .7}"></line>`;
    if (c % 10 === 0) g += `<text x="${x + cw / 2 + 3}" y="11" style="font-family:var(--f-mono);font-size:11px">${c + 1}</text>`;
    g += `<rect class="col" data-seq="${c}" x="${x}" y="${top - 2}" width="${cw}" height="${rh * rows.length + 4}" fill="transparent" style="cursor:pointer"></rect>`;
  }
  rows.forEach(({ r, j }, y) => {
    const cy = top + y * rh + rh / 2;
    g += `<text x="0" y="${cy + 4}"><tspan style="font-family:var(--f-mono);font-size:11px;fill:var(--muted)">${CODES[j].id}</tspan> ${esc(CODES[j].short)}</text>`;
    for (let c = 0; c < n; c++) {
      const v = +r[c], x = lw + c * cw;
      if (v >= 2) g += `<rect x="${x}" y="${cy - rh / 2 + 2}" width="${cw}" height="${rh - 4}" fill="var(--band)" pointer-events="none"></rect>`;
      if (v % 2 === 1) g += `<circle cx="${x + cw / 2}" cy="${cy}" r="${Math.min(4, cw / 2 - 1)}" fill="var(--accent)" pointer-events="none"></circle>`;
    }
  });
  return `<svg class="strip" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Where each theme comes up in this interview">${g}</svg>`;
}
function vInterview(k) {
  const iv = IV[k], S = D.strips[k];
  const seq = S.order.map((pi, c) => { const p = P[pi];
    return `<div class="seq" id="seq-${c}"><span class="sn">${c + 1}</span><div>${p.q ? `<p class="qq">${esc(p.q)}</p>` : ""}<p class="aa">${linkify(p.t)}</p>
      <div class="tg">${p.c.map(j => codeChip(j)).join("")}<button class="chip" data-p="${pi}">open</button></div></div></div>`; }).join("");
  return `<button class="btn" data-back="1">← All interviews</button>
    <div class="ivhead" style="margin-top:14px"><div><span class="eyebrow"><span class="dot ${iv.coll}"></span> ${COLL[iv.coll]} · ${esc(fmtDate(iv.date))}</span><h2>${esc(iv.name)}</h2>
      <p class="method">${iv.n} passages${iv.city ? " · Voices lists " + esc(iv.city) : ""}${iv.flag ? ` · <span class="flag">location ${iv.km} km from its collection</span>` : ""}${iv.ocr ? ` · <span class="flag">text from OCR</span>` : ""}</p></div>
      ${iv.url ? `<a class="btn" href="${esc(iv.url)}" target="_blank" rel="noopener">Listen on NOAA Voices ↗</a>` : ""}</div>
    <div class="stripbox"><span class="eyebrow">Theme index</span><p class="method" style="margin:2px 0 8px">Dots mark passages a code's search words matched; shaded bands are bursts, where a theme concentrates. Click a column to jump to that passage.</p>
      <div class="stripscroll">${stripSvg(k)}</div></div>
    <div class="seqlist">${seq}</div>`;
}

function vSearch() {
  const R = termRe(state.search);
  if (!R) return `<p class="empty">Type a word or phrase above.</p>`;
  const hits = [];
  P.forEach((p, i) => {
    if (state.searchColl !== "all" && IV[p.i].coll !== state.searchColl) return;
    let score = 0;
    for (const re of R.all) { re.lastIndex = 0; const m = p.t.match(re); if (!m) return; score += m.length; }
    hits.push([i, score]);
  });
  hits.sort((a, b) => b[1] - a[1]);
  const ivs = new Set(hits.map(h => P[h[0]].i)).size;
  return `<p class="eyebrow">Search results</p><h2 style="font-size:26px;font-weight:600;margin-top:4px">${esc(state.search)}</h2>
    <p class="method">${hits.length} passages in ${ivs} interviews contain ${R.terms.length > 1 ? "all of these words" : "this"}. Ranked by how often. Put a phrase in quotes to match it exactly; end a word with * to match any ending.</p>
    <div class="filters">${["all", ...COLL_ORDER].map(c => `<button class="chip${state.searchColl === c ? " on" : ""}" data-scoll="${c}">${c === "all" ? "All collections" : COLL[c]}</button>`).join("")}</div>
    ${plist(hits.map(h => h[0]), { re: R }, 40)}`;
}

/* ---------- reader ---------- */
function openReader(pi, code) {
  state.reader = pi; state.readerCode = code != null && code !== "" ? +code : null;
  const p = P[pi], iv = IV[p.i], S = D.strips[p.i], pos = S.order.indexOf(pi);
  let ranges = [];
  if (state.readerCode != null) { const r = evidenceRange(pi, state.readerCode); if (r) ranges.push([...r, "mark"]); }
  if (state.search && state.tab === "search") { const R = termRe(state.search); if (R) for (const re of R.all) ranges = ranges.concat(findAll(p.t, re).map(x => [...x, "mark"])); }
  ranges = ranges.concat(placeRanges(p.t));
  const tl = D.tlabels[String(p.tp)];
  const cite = `${iv.name}. Interview by Michael Nobel Kline, ${fmtDate(iv.date)}. ${COLL[iv.coll]} collection, Michael and Carrie Nobel Kline Collection, Berea College; NOAA Voices. Passage ${p.s + 1}.`;
  $("#reader").innerHTML = `<div class="rbar"><button class="btn" data-close="1" aria-label="Close reader">Close</button>
      <span class="sp num">Passage ${pos + 1} of ${S.order.length}</span>
      <button class="btn" data-step="-1" ${pos === 0 ? "disabled" : ""} aria-label="Previous passage">‹</button><button class="btn" data-step="1" ${pos === S.order.length - 1 ? "disabled" : ""} aria-label="Next passage">›</button></div>
    <div class="rbody">
      <div><span class="eyebrow"><span class="dot ${iv.coll}"></span> ${COLL[iv.coll]} · ${esc(fmtDate(iv.date))}</span>
        <div class="rname"><button data-iv="${p.i}" title="Open the whole interview">${esc(iv.name)}</button></div></div>
      ${p.q ? `<div class="rq"><b>Interviewer</b>${esc(p.q)}</div>` : ""}
      <p class="rtext">${marked(p.t, ranges)}</p>
      <div class="rsec"><b class="h">Tagged</b><div class="ptags">${p.c.map(k => codeChip(k, k === state.readerCode)).join("") || `<span class="method">No code's search words matched.</span>`}</div></div>
      ${p.k.length ? `<div class="rsec"><b class="h">Field cards quoting this passage</b><div class="ptags">${p.k.map(id => { const c = D.cards.find(x => x.id === id); return `<button class="chip" data-gocard="${id}">${esc(c.title)}</button>`; }).join("")}</div></div>` : ""}
      ${p.pl.length ? `<div class="rsec"><b class="h">Places named</b><div class="ptags">${p.pl.map(n => `<button class="chip" data-goplace="${esc(n)}">${esc(n)}</button>`).join("")}</div></div>` : ""}
      ${tl || p.y.length ? `<div class="rsec"><b class="h">Topic and years</b><div class="ptags">${tl ? `<button class="chip" data-gotopic="${p.tp}">${esc(tl.split(", ").slice(0, 3).join(", "))}</button>` : ""}${p.y.map(y => `<span class="chip mono">${y}</span>`).join("")}</div></div>` : ""}
      <div class="prov"><div><b>Source.</b> ${iv.ocr ? "Text read by OCR from a typed transcript; check quotes against the page images." : "Typed transcript from NOAA Voices."} Tags are machine-made from the draft codebook and have not been reviewed.</div>
        <div class="cite" id="cite">${esc(cite)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-copy="1">Copy citation</button>${iv.url ? `<a class="btn" href="${esc(iv.url)}" target="_blank" rel="noopener">Listen on NOAA Voices ↗</a>` : ""}</div></div>
      <div class="rsec"><b class="h">Sounds like this, in other interviews</b>${p.nb.map(([j, s]) => { const q = P[j], qi = IV[q.i];
        return `<button class="nb" data-p="${j}"><span class="pmeta">${ivLine(qi, `<span class="mono">${s.toFixed(2)}</span>`)}</span><div class="nbt">${esc(excerpt(q.t, 170)[0])}</div></button>`; }).join("")}</div>
    </div>`;
  $("#reader").hidden = false; $("#scrim").hidden = false;
  $(".rbody", $("#reader")).scrollTop = 0;
  $("[data-close]", $("#reader")).focus({ preventScroll: true });
}
function closeReader() { $("#reader").hidden = true; $("#scrim").hidden = true; state.reader = null; }

/* ---------- render + events ---------- */
function render() {
  const f = { questions: vQuestions, cards: vCards, places: vPlaces, codes: vCodes, map: vMap, interviews: vInterviews, search: vSearch }[state.tab];
  view.innerHTML = f();
}
document.addEventListener("click", e => {
  const t = e.target.closest("[data-allcards],[data-mkind],[data-cwhere],[data-clear],[data-qcards],[data-ckind],[data-zoom],[data-unc],[data-tab],[data-q],[data-p],[data-code],[data-codesel],[data-cuser],[data-gocard],[data-place],[data-iv],[data-ivs],[data-back],[data-topic],[data-gotopic],[data-goplace],[data-close],[data-step],[data-copy],[data-more],[data-scoll],[data-seq]");
  if (!t) { if (e.target === $("#scrim")) closeReader(); return; }
  const d = t.dataset;
  if (d.tab) { state.interview = null; go(d.tab); return; }
  if (d.more) { state.limit = +d.more; const y = window.scrollY; render(); window.scrollTo({ top: y }); return; }
  state.limit = 0;
  if (d.q) { state.q = d.q; render(); return; }
  if (d.p != null && d.p !== "") { openReader(+d.p, t.closest("[data-code]") ? t.closest("[data-code]").dataset.code : null); return; }
  if (d.codesel) { state.code = +d.codesel; render(); return; }
  if (d.code != null && d.code !== "" && t.tagName === "BUTTON") { state.code = +d.code; closeReader(); go("codes"); return; }
  if (d.cuser) { state.cardUser = d.cuser; render(); return; }
  if (d.mkind != null) { const k = d.mkind, c = d.mcoll || null; const same = state.cardKind === k && state.cardColl === c; state.cardKind = same ? null : k; state.cardColl = same ? null : c; render(); return; }
  if (d.allcards) { state.cardUser = "All"; state.cardKind = state.cardColl = state.cardQ = null; state.cardText = d.allcards; state.cardWhere = null; go("cards"); return; }
  if (d.cwhere) { state.cardWhere = state.cardWhere === d.cwhere ? null : d.cwhere; render(); return; }
  if (d.clear) { if (d.clear === "all") { state.cardKind = state.cardColl = state.cardWhere = state.cardQ = null; state.cardText = ""; } else state[d.clear] = null; render(); return; }
  if (d.qcards) { state.cardQ = d.qcards; state.cardKind = state.cardColl = state.cardWhere = null; state.cardText = ""; state.cardUser = "All"; go("cards"); return; }
  if (d.ckind) { state.cardKind = d.ckind === "*" ? null : d.ckind; render(); return; }
  if (d.gocard) { state.card = d.gocard; state.cardUser = "All"; state.cardKind = state.cardColl = state.cardWhere = state.cardQ = null; state.cardText = ""; closeReader(); go("cards"); const el = $("#card-" + d.gocard); if (el) el.scrollIntoView({ block: "center" }); return; }
  if (d.goplace) {
    e.preventDefault();
    const sp = D.places.find(p => p.name === d.goplace);
    state.place = d.goplace; state.placeFilter = ""; state.unconfirmed = state.unconfirmed || !(sp && sp.ok);
    state.zoom = sp && sp.loc && sp.loc.xy ? "place" : "region";
    closeReader(); go("places");
    const row = document.querySelector(`.plrow[data-place="${CSS.escape(d.goplace)}"]`); if (row) row.scrollIntoView({ block: "nearest" });
    return;
  }
  if (d.gotopic) { state.topic = +d.gotopic; closeReader(); go("map"); return; }
  if (d.place) { const sp = D.places.find(p => p.name === d.place); state.place = state.place === d.place ? null : d.place;
    if (state.place && sp && sp.loc && sp.loc.xy && t.classList.contains("plrow")) state.zoom = "place"; else if (!state.place && state.zoom === "place") state.zoom = "region"; render(); return; }
  if (d.ivs) { const ks = d.ivs.split(","); state.interview = ks.length === 1 ? +ks[0] : null; go("interviews"); return; }
  if (d.iv != null && d.iv !== "") { state.interview = +d.iv; closeReader(); go("interviews"); return; }
  if (d.back) { state.interview = null; render(); return; }
  if (d.topic) { state.topic = d.topic === "clear" || +d.topic === state.topic ? null : +d.topic; render(); return; }
  if (d.scoll) { state.searchColl = d.scoll; render(); return; }
  if (d.zoom) { state.zoom = d.zoom; render(); return; }
  if (d.unc) { state.unconfirmed = !state.unconfirmed; render(); return; }
  if (d.seq != null && d.seq !== "") { const el = $("#seq-" + d.seq); if (el) { el.scrollIntoView({ block: "start", behavior: "smooth" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400); } return; }
  if (d.close) { closeReader(); return; }
  if (d.step) { const S = D.strips[P[state.reader].i], pos = S.order.indexOf(state.reader) + +d.step; if (pos >= 0 && pos < S.order.length) openReader(S.order[pos], state.readerCode); return; }
  if (d.copy) {
    const txt = $("#cite").textContent;
    const done = () => { t.textContent = "Copied"; setTimeout(() => (t.textContent = "Copy citation"), 1500); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($("#cite")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); t.textContent = "Selected: press Ctrl+C"; };
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (err) { fallback(); }
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && state.reader != null) { closeReader(); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("[role=button],tr[data-iv]")) { e.preventDefault(); e.target.click(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "cardtext") { state.cardText = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#cardtext"); el.focus(); el.setSelectionRange(pos, pos); return; }
  if (e.target.id === "placefilter") { state.placeFilter = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#placefilter"); el.focus(); el.setSelectionRange(pos, pos); }
});
$("#searchform").addEventListener("submit", e => {
  e.preventDefault(); const v = $("#q").value.trim(); if (!v) return;
  state.search = v; state.searchColl = "all"; closeReader(); go("search", false);
});
/* tooltips for map points */
const tip = $("#tip");
document.addEventListener("mousemove", e => {
  const c = e.target.closest && e.target.closest("circle.pt,circle.ptmark,rect.ivmark");
  if (!c) { tip.hidden = true; return; }
  let h = "";
  if (c.classList.contains("pt")) { const p = P[+c.dataset.p], iv = IV[p.i]; h = `<b>${esc(iv.name)}</b> · ${COLL[iv.coll]}<br>${esc(excerpt(p.t, 150)[0])}`; }
  else if (c.classList.contains("ptmark")) { const p = D.places.find(x => x.name === c.dataset.place); h = `<b>${esc(p.name)}</b><br>${esc(p.loc.county)}, ${esc(p.loc.state)} · ${p.n} passages, ${p.iv} interviews`; }
  else { const ks = c.dataset.ivs.split(",").map(Number); h = `<b>Interview location</b><br>${ks.slice(0, 6).map(k => esc(IV[k].name)).join("<br>")}${ks.length > 6 ? `<br>and ${ks.length - 6} more` : ""}`; }
  tip.innerHTML = h; tip.hidden = false;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
  tip.style.left = x + "px"; tip.style.top = y + "px";
});

/* ---------- boot ---------- */
const M = D.meta;
$("#sub").textContent = `Kline flood oral histories · ${M.n_interviews} interviews · ${M.n_passages.toLocaleString()} passages · ${Math.round(M.words / 1000)}k narrator words`;
$("#notice").textContent = "Internal prototype. Transcripts from the Michael and Carrie Nobel Kline Collection, Berea College, shared through NOAA Voices for exploratory work. Do not post or share outside the team. Machine tags and rankings have not been reviewed.";
const h = (location.hash || "").slice(1);
state.tab = TABS.some(t => t[0] === h) ? h : "questions";
renderTabs(); render();
})().catch(error => {
  console.error("High Water Explorer initialization failed:", error);
  document.getElementById("view").textContent = "Unable to load explorer data. Please check that explorer_data.json is uploaded alongside this page. " + error.message;
});
