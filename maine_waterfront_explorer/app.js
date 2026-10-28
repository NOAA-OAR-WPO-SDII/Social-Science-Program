/* Maine Waterfront Explorer application. Data is provided by data-*.js. */
const D = window.MWE_DATA;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const fmt = n => n.toLocaleString("en-US");
const pct = x => (x * 100).toFixed(x < .1 ? 1 : 0) + "%";
const CODES = D.codes, CODE = Object.fromEntries(CODES.map(c => [c.id, c]));
const IV = D.interviews, P = D.passages;
P.forEach((p, i) => { p.i = i; p.cs = new Set(p.c.map(x => x[0])); });
const byIv = IV.map(() => []); P.forEach(p => byIv[p.iv].push(p));
const PERIODS = ["2003–06", "2009–15", "2018–21", "2023–25"];
const COLLS = D.collections.map(c => c.short);
const has = (p, c) => p.cs.has(c);
const store = { get(k) { try { return localStorage.getItem("mwe:" + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem("mwe:" + k, v); } catch (e) {} } };

const state = { tab: store.get("tab") || "overview", code: "M3", coll: "", period: "", high: false, page: 0, town: null, q: "", qcode: "", iv: null, ivq: "", sort: "coll",
  topic: null, tsort: "niv", mmcode: "", tpage: 0, layer: "recorded", place: null, thread: null, thpage: 0, adv: "", wsec: "", wq: "" };
const TOPICS = D.topics, TOPIC = Object.fromEntries(TOPICS.map(t => [t.t, t]));
const byTopic = {}; P.forEach(p => (byTopic[p.tp] ||= []).push(p));
const PLACES = D.places; const byPlace = PLACES.map(() => []); P.forEach(p => (p.pl || []).forEach(k => byPlace[k].push(p)));

/* ---------- evidence + term highlighting on raw text ---------- */
function rxFor(s) {
  const parts = s.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’‘]/g, "['’‘]").replace(/["“”]/g, '["“”]'));
  return new RegExp(parts.join("\\s+"));
}
function marked(text, evs = [], terms = []) {
  const R = [];
  for (const [code, , ev] of evs) { const m = rxFor(ev).exec(text); if (m) R.push([m.index, m.index + m[0].length, "ev", code]); }
  for (const t of terms) { const re = new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*", "gi"); let m; while ((m = re.exec(text))) R.push([m.index, m.index + m[0].length, "t"]); }
  R.sort((a, b) => a[0] - b[0]);
  let out = "", at = 0;
  for (const [s, e, k, code] of R) { if (s < at) continue; out += esc(text.slice(at, s)) + `<mark class="${k === "ev" ? "ev" : ""}"${code ? ` title="${esc(code + " " + CODE[code].short)}"` : ""}>` + esc(text.slice(s, e)) + "</mark>"; at = e; }
  return out + esc(text.slice(at));
}
function snippet(p, code, terms = []) {
  const t = p.t; let start = 0;
  const ev = code ? p.c.find(x => x[0] === code) : null;
  if (ev) { const m = rxFor(ev[2]).exec(t); if (m) start = Math.max(0, m.index - 160); }
  else if (terms.length) { const m = new RegExp("\\b" + terms[0], "i").exec(t); if (m) start = Math.max(0, m.index - 160); }
  if (start > 0) { const sp = t.indexOf(" ", start); start = sp > 0 ? sp + 1 : start; }
  const end = Math.min(t.length, start + 520);
  const sub = t.slice(start, end);
  const shift = c => c;
  return (start > 0 ? "… " : "") + marked(sub, ev ? [ev] : [], terms) + (end < t.length ? " …" : "");
}
const codeChips = (p, onCode) => p.c.map(([c, hi]) => `<button class="chip${hi ? "" : " med"}${c === onCode ? " on" : ""}" data-code="${c}" title="${esc(CODE[c].label)}${hi ? "" : " (medium confidence)"}"><span class="cid">${c}</span>${esc(CODE[c].short)}</button>`).join("");
const who = iv => `<b>${esc(iv.name)}</b><span>${esc(iv.forum ? iv.coll : iv.town || iv.coll)}${iv.year ? ", " + iv.year : ""}</span>`;
function pItem(p, code, terms, extra) {
  const iv = IV[p.iv];
  return `<div class="pitem" role="button" tabindex="0" data-p="${p.i}"><div class="pmeta">${who(iv)}<span class="mono">${esc(iv.coll)}</span>${extra || ""}</div>
    <p class="ptext">${snippet(p, code, terms)}</p>${p.c.length ? `<div class="ptags">${codeChips(p, code)}</div>` : ""}</div>`;
}

/* ---------- tabs ---------- */
function tabs() {
  const t = [["overview", "Overview"], ["story", "Story"], ["codes", "Codes", CODES.length], ["topics", "Topics", TOPICS.length], ["map", "Map"], ["interviews", "Interviews", IV.length], ["search", "Search"] //["method", "Method"]]//;
  $("#tabs").innerHTML = t.map(([id, label, n]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${label}${n != null ? `<span class="ct">${n}</span>` : ""}</button>`).join("");
}
function go(tab, patch = {}) { Object.assign(state, patch); state.tab = tab; store.set("tab", tab); render(); window.scrollTo({ top: 0 }); }
function render() { tabs(); (({ overview: vOverview, story: vStory, codes: vCodes, topics: vTopics, map: vMap, interviews: vInterviews, search: vSearch, method: vMethod })[state.tab] || vOverview)(); }

/* ---------- overview ---------- */
function share(ps, c) { return ps.length ? ps.filter(p => has(p, c)).length / ps.length : null; }
function vOverview() {
  const coded = P.filter(p => p.c.length).length;
  const ivShare = c => IV.filter((iv, k) => byIv[k].some(p => has(p, c))).length / IV.length;
  const top = [...CODES].sort((a, b) => ivShare(b.id) - ivShare(a.id));
  const cols = [...D.collections].sort((a, b) => b.n_iv - a.n_iv);
  const max = Math.max(...CODES.flatMap(c => cols.map(cl => share(P.filter(p => IV[p.iv].coll === cl.short), c.id) || 0)));
  const cell = (v, attrs, cls = "") => v == null ? `<td class="na">–</td>` : `<td class="${cls}${v / max > .55 ? " hi" : ""}" style="--a:${(v / max * .9).toFixed(2)}" ${attrs}>${(v * 100).toFixed(0)}</td>`;
  const byColl = Object.fromEntries(cols.map(cl => [cl.short, P.filter(p => IV[p.iv].coll === cl.short)]));
  const byPer = Object.fromEntries(PERIODS.map(pe => [pe, P.filter(p => IV[p.iv].period === pe)]));
  $("#view").innerHTML = `
    <div class="eyebrow">Overview</div>
    <h2 class="view">The rules, a changing ocean and how people adjust run through most Maine interviews</h2>
    <p class="lede">${fmt(IV.length)} interviews from ${D.collections.length} NOAA Voices collections, 2003–2025, split into ${fmt(P.length)} question-and-answer passages and coded with an eight-code working-waterfront codebook. Every code carries a quote copied word for word from the narrator. Click any number to read the passages behind it.</p>
    <div class="stats"><div><b class="num">${fmt(IV.length)}</b><span>interviews</span></div><div><b class="num">${fmt(P.length)}</b><span>passages</span></div><div><b class="num">${pct(coded / P.length)}</b><span>carry at least one code</span></div><div><b class="num">${D.collections.length}</b><span>collections</span></div></div>
    <div class="panel"><h3>Share of interviews that raise each code</h3>
      <div class="plist" style="gap:6px">${top.map(c => `<button class="codebtn" data-gocode="${c.id}"><span class="cid">${c.id}</span><span class="nm">${esc(c.short)}${c.candidate ? '<span class="cand">candidate</span>' : ""}</span><span class="pct">${pct(ivShare(c.id))}</span><span class="bar"><i style="width:${ivShare(c.id) * 100}%"></i></span></button>`).join("")}</div>
      <p class="note">An interview counts when at least one of its passages carries the code.</p></div>
    <div class="panel"><h3>Where each code is concentrated: % of passages, by collection</h3>
      <div class="scroll"><table class="heat"><thead><tr><th></th>${cols.map(cl => `<th title="${esc(cl.full)}">${esc(cl.short)}<span class="mono">${esc(cl.years)}</span></th>`).join("")}<th>All</th></tr></thead>
      <tbody>${top.map(c => `<tr><th><span class="mono">${c.id}</span> ${esc(c.short)}</th>${cols.map(cl => cell(share(byColl[cl.short], c.id), `data-heat="${c.id}|${esc(cl.short)}|" title="${esc(cl.short)}: ${byColl[cl.short].filter(p => has(p, c.id)).length} of ${byColl[cl.short].length} passages"`)).join("")}${cell(share(P, c.id), `data-heat="${c.id}||"`, "all")}</tr>`).join("")}</tbody></table></div>
      <p class="note">Each project used its own interview guide, so differences between collections partly reflect what interviewers asked.</p></div>
    <div class="panel"><h3>Over time: % of passages, by when the interview was recorded</h3>
      <div class="scroll"><table class="heat"><thead><tr><th></th>${PERIODS.map(pe => `<th>${pe}<br><span class="mono">${fmt(byPer[pe].length)}</span></th>`).join("")}</tr></thead>
      <tbody>${top.map(c => `<tr><th><span class="mono">${c.id}</span> ${esc(c.short)}</th>${PERIODS.map(pe => cell(share(byPer[pe], c.id), `data-heat="${c.id}||${pe}"`)).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="note">Undated interviews (${P.filter(p => IV[p.iv].period === "undated").length} passages) are left out of this table.</p></div>`;
}

/* ---------- codes ---------- */
function filtered() {
  return P.filter(p => has(p, state.code) && (!state.coll || IV[p.iv].coll === state.coll) && (!state.period || IV[p.iv].period === state.period)
    && (!state.high || p.c.some(x => x[0] === state.code && x[1])));
}
function vCodes() {
  const c = CODE[state.code], L = filtered(), per = 25, pages = Math.max(1, Math.ceil(L.length / per));
  state.page = Math.min(state.page, pages - 1);
  const shown = L.slice(state.page * per, state.page * per + per);
  $("#view").innerHTML = `<div class="cols"><div class="side">
      <div class="eyebrow">Codes</div>
      ${CODES.map(k => { const s = share(P, k.id); return `<button class="codebtn${k.id === state.code ? " on" : ""}" data-setcode="${k.id}"><span class="cid">${k.id}</span><span class="nm">${esc(k.short)}${k.candidate ? '<span class="cand">candidate</span>' : ""}</span><span class="pct">${fmt(P.filter(p => has(p, k.id)).length)}</span><span class="bar"><i style="width:${s / .12 * 100}%"></i></span></button>`; }).join("")}
      <p class="note">Numbers are passages carrying the code.</p></div>
    <div>
      <div class="eyebrow"><span class="mono">${c.id}</span>${c.candidate ? '<span class="cand">candidate code</span>' : ""}</div>
      <h2 class="view">${esc(c.label)}</h2>
      <div class="defn"><p>${esc(c.definition)}</p><p><b>Includes:</b> ${esc(c.include)}</p><p><b>Excludes:</b> ${esc(c.exclude)}</p></div>
      <div class="filters">
        <label>Collection <select id="fcoll"><option value="">All</option>${COLLS.map(s => `<option${s === state.coll ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
        <label>Recorded <select id="fper"><option value="">Any time</option>${PERIODS.map(s => `<option${s === state.period ? " selected" : ""}>${s}</option>`).join("")}</select></label>
        <label><input type="checkbox" id="fhigh"${state.high ? " checked" : ""}> High confidence only</label>
      </div>
      <p class="note">${fmt(L.length)} passages. The highlighted span is the coder's evidence; dashed chips are medium confidence.</p>
      <div class="plist">${shown.map(p => pItem(p, state.code)).join("") || `<p class="empty">No passages match these filters.</p>`}</div>
      ${pages > 1 ? `<div class="pager"><button class="btn" data-page="-1"${state.page ? "" : " disabled"}>Previous</button><span>Page ${state.page + 1} of ${pages}</span><button class="btn" data-page="1"${state.page < pages - 1 ? "" : " disabled"}>Next</button></div>` : ""}
    </div></div>`;
  $("#fcoll").onchange = e => { state.coll = e.target.value; state.page = 0; vCodes(); };
  $("#fper").onchange = e => { state.period = e.target.value; state.page = 0; vCodes(); };
  $("#fhigh").onchange = e => { state.high = e.target.checked; state.page = 0; vCodes(); };
}

/* ---------- topics + meaning map ---------- */
function tLabel(t) { return t == null || t < 0 ? "no topic (outlier)" : TOPIC[t].label; }
function vTopics() {
  const W = 1000, H = 720, pad = 18;
  const sel = state.topic != null ? TOPIC[state.topic] : null, mc = state.mmcode;
  const X = v => pad + v * (W - 2 * pad), Y = v => pad + v * (H - 2 * pad);
  const order = [...P].sort((a, b) => ((sel && a.tp === sel.t) || (mc && has(a, mc)) ? 1 : 0) - ((sel && b.tp === sel.t) || (mc && has(b, mc)) ? 1 : 0));
  const pts = order.map(p => `<circle class="mmpt${sel && p.tp === sel.t ? " on" : mc && has(p, mc) ? " code" : ""}" cx="${X(p.xy[0]).toFixed(1)}" cy="${Y(p.xy[1]).toFixed(1)}" r="${sel && p.tp === sel.t ? 2.8 : 2.1}" data-p="${p.i}"><title>${esc(IV[p.iv].name)}: ${esc(p.t.slice(0, 140))}…</title></circle>`).join("");
  const big = TOPICS.filter(t => t.n >= 40 || (sel && t.t === sel.t));
  const labs = big.map(t => `<text class="mmlab${sel && t.t === sel.t ? " on" : ""}" x="${X(t.xy[0]).toFixed(1)}" y="${Y(t.xy[1]).toFixed(1)}" text-anchor="middle">${esc(t.label.split(", ").slice(0, 2).join(", "))}</text>`).join("");
  const key = { niv: t => -t.niv, n: t => -t.n, gap: t => -t.uncoded, stab: t => -t.stab }[state.tsort];
  const L = [...TOPICS].sort((a, b) => key(a) - key(b));
  const outl = P.filter(p => p.tp < 0).length;
  let side;
  if (sel) {
    const ps = byTopic[sel.t] || [], per = 30, pages = Math.ceil(ps.length / per);
    state.tpage = Math.min(state.tpage, Math.max(0, pages - 1));
    const cwmax = Math.max(...Object.values(sel.cw), .05);
    side = `<p><button class="btn" data-topic="">All topics</button></p>
      <div class="eyebrow">Topic ${sel.t}</div><h2 class="view" style="font-size:22px">${esc(sel.label)}</h2>
      <p class="note">${esc(sel.words)}</p>
      <p class="note">${fmt(sel.n)} passages · ${sel.niv} interviews · ${sel.ncoll} collections · ${esc(sel.years)} · stability ${sel.stab.toFixed(2)}${sel.flags !== "ok" ? ` · <span class="flagchip">${esc(sel.flags)}</span>` : ""}<br>Largest collection: ${esc(sel.topColl)} (${pct(sel.topShare)})</p>
      <h3 style="font-size:16px;margin-top:12px">Codes on this topic's passages</h3>
      <div class="cwbars">${CODES.map(c => `<span class="mono">${c.id}</span><span class="tk"><i style="width:${(sel.cw[c.id] / cwmax * 100).toFixed(0)}%"></i></span><span class="mono">${pct(sel.cw[c.id])}</span>`).join("")}<span class="mono">none</span><span class="tk"><i style="width:${Math.min(100, sel.uncoded / cwmax * 100).toFixed(0)}%;background:var(--muted)"></i></span><span class="mono">${pct(sel.uncoded)}</span></div>
      <h3 style="font-size:16px;margin-top:14px">Share of passages, by when recorded</h3>
      <div class="cwbars">${PERIODS.map(pe => `<span class="mono">${pe}</span><span class="tk"><i style="width:${Math.min(100, sel.per[pe] / Math.max(...Object.values(sel.per), .001) * 100).toFixed(0)}%"></i></span><span class="mono">${(sel.per[pe] * 100).toFixed(1)}%</span>`).join("")}</div>
      <h3 style="font-size:16px;margin-top:14px">Closest to the centre</h3>
      <div class="plist">${sel.reps.map(i => pItem(P[i])).join("")}</div>
      <h3 style="font-size:16px;margin-top:14px">All ${fmt(ps.length)} passages</h3>
      <div class="plist">${ps.slice(state.tpage * per, state.tpage * per + per).map(p => pItem(p)).join("")}</div>
      ${pages > 1 ? `<div class="pager"><button class="btn" data-tpage="-1"${state.tpage ? "" : " disabled"}>Previous</button><span>${state.tpage + 1} / ${pages}</span><button class="btn" data-tpage="1"${state.tpage < pages - 1 ? "" : " disabled"}>Next</button></div>` : ""}`;
  } else {
    side = `<div class="filters" style="margin-top:0"><span class="note" style="margin:0">Sort:</span>${[["niv", "Interviews"], ["n", "Passages"], ["gap", "Least coded"], ["stab", "Most stable"]].map(([k, l]) => `<button class="chip${state.tsort === k ? " on" : ""}" data-tsort="${k}">${l}</button>`).join("")}</div>
      ${L.map(t => `<div class="trow" data-topic="${t.t}"><span class="nm">${esc(t.label)}</span><span class="n">${t.niv} iv · ${t.n}</span><span class="sub">${t.ncoll} collections · top code ${esc(Object.entries(t.cw).sort((a, b) => b[1] - a[1])[0][0])} · ${pct(t.uncoded)} uncoded${t.flags !== "ok" ? ` <span class="flagchip">${esc(t.flags)}</span>` : ""}</span></div>`).join("")}`;
  }
  $("#view").innerHTML = `<div class="eyebrow">Topics</div>
    <h2 class="view">${TOPICS.length} topics found in what narrators said, without the codebook</h2>
    <p class="lede">Each dot is a passage, placed so that passages saying similar things sit close together (WordLlama embeddings, UMAP). BERTopic groups dense regions into topics and labels each with its most distinctive words; ${pct(outl / P.length)} of passages sit outside any topic. Labels are word lists, not agreed names. Read nearby clusters, not distances across the map.</p>
    <div class="filters"><span class="note" style="margin:0">Also mark passages coded:</span><button class="chip${mc ? "" : " on"}" data-mmcode="">none</button>${CODES.map(k => `<button class="chip${k.id === mc ? " on" : ""}" data-mmcode="${k.id}"><span class="cid">${k.id}</span>${esc(k.short)}</button>`).join("")}</div>
    <div class="mmwrap"><div><div class="mmbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Meaning map of ${fmt(P.length)} passages">${pts}${labs}</svg>
      <div class="mapfoot"><span class="legend2">${sel ? `<span><i class="sw" style="background:var(--accent)"></i>this topic</span>` : ""}${mc ? `<span><i class="sw" style="background:#c9822b"></i>${mc} ${esc(CODE[mc].short)}</span>` : ""}<span><i class="sw" style="background:var(--line)"></i>other passages</span></span><span>Click a dot to read it</span></div></div>
      <p class="note">Least-coded topics are where the codebook may be missing something: sort the list by “Least coded”. Stability is the average best-match overlap with three reruns on other random seeds (1 = identical).</p></div>
      <div class="side">${side}</div></div>`;
}

/* ---------- map ---------- */
function towns() {
  const T = {};
  IV.forEach((iv, k) => { if (!iv.xy) return; const t = T[iv.town] ||= { name: iv.town, xy: iv.xy, ivs: [], ps: [], approx: iv.approx }; t.ivs.push(k); t.ps.push(...byIv[k]); });
  return Object.values(T);
}
function vMap() {
  if (state.layer === "mentioned") return vMapMentioned();
  const T = towns(), c = state.code;
  const maxIv = Math.max(...T.map(t => t.ivs.length));
  const vals = T.map(t => share(t.ps, c));
  const vmax = Math.max(...vals.filter(v => v != null), .01);
  const sel = T.find(t => t.name === state.town);
  const label = new Set(["Portland", "Rockland", "Ellsworth", "Eastport", "Stonington", "Bar Harbor", "Jonesport", "Boothbay Harbor", "Kittery", "Lubec", "Port Clyde"]);
  const svg = `<svg viewBox="0 0 ${D.map.w} ${D.map.h}" role="img" aria-label="Map of interview towns on the Maine coast">
    ${D.map.counties.map(k => `<path class="county${k.state !== "23" ? " other" : ""}" d="${k.d}"><title>${esc(k.name)} County</title></path>`).join("")}
    <text class="maplabel st" x="${D.map.w * .44}" y="${D.map.h * .14}">MAINE</text>
    <text class="maplabel st" x="${D.map.w * .03}" y="${D.map.h * .62}">N.H.</text>
    ${[...T].sort((a, b) => b.ivs.length - a.ivs.length).map((t, j) => { const v = share(t.ps, c), r = 4 + 13 * Math.sqrt(t.ivs.length / maxIv);
      return `<circle class="town${t.name === state.town ? " sel" : ""}" data-town="${esc(t.name)}" cx="${t.xy[0]}" cy="${t.xy[1]}" r="${r.toFixed(1)}" style="fill:color-mix(in srgb, var(--accent) ${(12 + 88 * (v || 0) / vmax).toFixed(0)}%, var(--land))"><title>${esc(t.name)}${t.approx ? " (approximate)" : ""}: ${t.ivs.length} interviews, ${pct(v || 0)} of passages coded ${c}</title></circle>`; }).join("")}
    ${T.filter(t => label.has(t.name)).map(t => { const east = t.xy[0] > D.map.w * .82; return `<text class="maplabel" x="${t.xy[0] + (east ? -9 : 9)}" y="${t.xy[1] + (t.name === "Lubec" ? 14 : 4)}" text-anchor="${east ? "end" : "start"}">${esc(t.name)}</text>`; }).join("")}
  </svg>`;
  let side;
  if (sel) {
    const ps = sel.ps.filter(p => has(p, c));
    side = `<div class="eyebrow">Town</div><h2 class="view">${esc(sel.name)}</h2>
      <p class="note">${sel.ivs.length} interviews · ${fmt(sel.ps.length)} passages · ${ps.length} coded ${c} ${esc(CODE[c].short)}${sel.name === "Rockland" ? ". Rockland includes every Fishermen's Forum interview, recorded at the Forum, not at the narrator's home harbor." : ""}${sel.approx ? ". Location is approximate." : ""}</p>
      <div style="margin-top:8px">${sel.ivs.map(k => `<div class="plrow" data-goiv="${k}"><span class="nm">${esc(IV[k].name)}</span><span class="n">${byIv[k].filter(p => has(p, c)).length}/${byIv[k].length}</span><span class="sub">${esc(IV[k].coll)}${IV[k].year ? ", " + IV[k].year : ""}</span></div>`).join("")}</div>
      <div class="plist">${ps.slice(0, 40).map(p => pItem(p, c)).join("")}</div>
      ${ps.length > 40 ? `<p class="note">Showing 40 of ${ps.length}. Open an interview above to read the rest.</p>` : ""}
      <p><button class="btn" data-town="">Back to all towns</button></p>`;
  } else {
    side = `<div class="eyebrow">Towns</div><p class="note">Circle size is interviews; shade is the share of passages coded <b>${c} ${esc(CODE[c].short)}</b>. Click a town.</p>
      ${T.sort((a, b) => b.ivs.length - a.ivs.length).map(t => `<div class="plrow" data-town="${esc(t.name)}"><span class="nm">${esc(t.name)}</span><span class="n">${t.ivs.length} interview${t.ivs.length > 1 ? "s" : ""} · ${pct(share(t.ps, c) || 0)}</span></div>`).join("")}`;
  }
  $("#view").innerHTML = `<div class="eyebrow">Map</div><h2 class="view">Where people talked about ${esc(CODE[c].short.toLowerCase())}</h2>
    ${layerChips()}
    <div class="filters">${CODES.map(k => `<button class="chip${k.id === c ? " on" : ""}" data-mapcode="${k.id}"><span class="cid">${k.id}</span>${esc(k.short)}</button>`).join("")}</div>
    <div class="cols mapcols"><div class="mapbox">${svg}<div class="mapfoot"><span class="ramp">0% <i></i> ${pct(vmax)} of passages</span><span>Towns from Voices metadata; the Forum is held in Rockland. Canada is not drawn.</span></div></div><div class="side">${side}</div></div>`;
}

function layerChips() {
  return `<div class="filters"><span class="note" style="margin:0">Show:</span><button class="chip${state.layer === "recorded" ? " on" : ""}" data-layer="recorded">Where interviews were recorded</button><button class="chip${state.layer === "mentioned" ? " on" : ""}" data-layer="mentioned">Places narrators mention (${PLACES.length})</button></div>`;
}
function baseSvg(inner, label) {
  return `<svg viewBox="0 0 ${D.map.w} ${D.map.h}" role="img" aria-label="${esc(label)}">
    ${D.map.counties.map(k => `<path class="county${k.state !== "23" ? " other" : ""}" d="${k.d}"><title>${esc(k.name)} County</title></path>`).join("")}
    <text class="maplabel st" x="${D.map.w * .44}" y="${D.map.h * .14}">MAINE</text>
    <text class="maplabel st" x="${D.map.w * .03}" y="${D.map.h * .62}">N.H.</text>${inner}</svg>`;
}
function vMapMentioned() {
  const c = state.code, sel = state.place != null ? PLACES[state.place] : null;
  const vals = PLACES.map((pl, k) => share(byPlace[k], c) || 0), vmax = Math.max(...vals, .01), nmax = Math.max(...PLACES.map(pl => pl.n));
  const order = PLACES.map((pl, k) => k).sort((a, b) => PLACES[b].n - PLACES[a].n);
  const inner = order.map(k => { const pl = PLACES[k], r = 3 + 14 * Math.sqrt(pl.n / nmax);
    return `<circle class="town${k === state.place ? " sel" : ""}" data-place="${k}" cx="${pl.xy[0]}" cy="${pl.xy[1]}" r="${r.toFixed(1)}" style="fill:color-mix(in srgb, var(--accent) ${(12 + 88 * vals[k] / vmax).toFixed(0)}%, var(--land))"><title>${esc(pl.name)}: mentioned in ${pl.n} passages from ${pl.niv} interviews; ${pct(vals[k])} coded ${c}</title></circle>`; }).join("")
    + order.slice(0, 14).map(k => { const pl = PLACES[k], east = pl.xy[0] > D.map.w * .82; return `<text class="maplabel" x="${pl.xy[0] + (east ? -9 : 9)}" y="${pl.xy[1] + 4}" text-anchor="${east ? "end" : "start"}">${esc(pl.name)}</text>`; }).join("");
  let side;
  if (sel) {
    const ps = byPlace[state.place];
    side = `<div class="eyebrow">Place mentioned</div><h2 class="view">${esc(sel.name)}</h2>
      <p class="note">${sel.n} passages from ${sel.niv} interviews mention it${sel.said.length ? ` (as “${sel.said.map(esc).join("”, “")}”)` : ""}. ${ps.filter(p => has(p, c)).length} are coded ${c}.</p>
      <div class="plist">${ps.slice(0, 40).map(p => pItem(p, c, [sel.said[0] || sel.name])).join("")}</div>
      <p><button class="btn" data-place="">Back to all places</button></p>`;
  } else {
    side = `<div class="eyebrow">Places mentioned</div><p class="note">Town names found in narrator speech by named-entity recognition, coastal feature words and a local gazetteer, placed at the matching town nearest the interview. Circle size is passages; shade is the share coded <b>${c}</b>.</p>
      ${order.map(k => `<div class="plrow" data-place="${k}"><span class="nm">${esc(PLACES[k].name)}</span><span class="n">${PLACES[k].n} · ${pct(vals[k])}</span><span class="sub">${PLACES[k].niv} interviews${PLACES[k].state !== "Maine" ? " · " + esc(PLACES[k].state) : ""}</span></div>`).join("")}`;
  }
  $("#view").innerHTML = `<div class="eyebrow">Map</div><h2 class="view">Places narrators talk about</h2>${layerChips()}
    <div class="filters">${CODES.map(k => `<button class="chip${k.id === c ? " on" : ""}" data-mapcode="${k.id}"><span class="cid">${k.id}</span>${esc(k.short)}</button>`).join("")}</div>
    <div class="cols mapcols"><div class="mapbox">${baseSvg(inner, "Map of places narrators mention")}<div class="mapfoot"><span class="ramp">0% <i></i> ${pct(vmax)} of passages</span><span>Gazetteer: postal place names for ME, NH and MA, standing in for GNIS, so islands, ledges, coves and rivers are not placed yet.</span></div></div><div class="side">${side}</div></div>`;
}

/* ---------- interviews ---------- */
function prof(iv, k) {
  const n = byIv[k].length || 1, mx = .3;
  return `<span class="prof" title="${CODES.map(c => `${c.id} ${c.short}: ${iv.prof[c.id]}`).join("\n")}">${CODES.map(c => `<i class="${iv.prof[c.id] ? "" : "z"}" style="height:${Math.max(1, Math.min(1, iv.prof[c.id] / n / mx) * 22)}px"></i>`).join("")}</span>`;
}
function vInterviews() {
  if (state.iv != null) return vInterview(state.iv);
  const q = state.ivq.toLowerCase();
  let L = IV.map((iv, k) => k).filter(k => !q || [IV[k].name, IV[k].town, IV[k].coll, IV[k].intr].join(" ").toLowerCase().includes(q));
  const key = { coll: k => IV[k].coll + IV[k].name, name: k => IV[k].name, year: k => String(IV[k].year || 0).padStart(4, "0") + IV[k].name, town: k => IV[k].town + IV[k].name, n: k => String(9999 - byIv[k].length).padStart(4, "0") }[state.sort];
  L.sort((a, b) => key(a).localeCompare(key(b)));
  $("#view").innerHTML = `<div class="eyebrow">Interviews</div><h2 class="view">${fmt(IV.length)} interviews</h2>
    <p class="lede">The bars show each interview's code profile, in the order ${CODES.map(c => c.id).join(", ")}. Click a row to read the whole interview with its codes.</p>
    <input class="filterbox" id="ivq" placeholder="Filter by name, town, collection or interviewer" value="${esc(state.ivq)}">
    <div class="scroll"><table class="ivtable"><thead><tr><th data-sort="name">Narrator</th><th data-sort="town">Town</th><th data-sort="year">Year</th><th class="hide-s" data-sort="coll">Collection</th><th data-sort="n">Passages</th><th>Codes</th></tr></thead>
    <tbody>${L.map(k => `<tr class="row" data-goiv="${k}"><td class="nm">${esc(IV[k].name)}</td><td>${esc(IV[k].town)}</td><td class="num">${IV[k].year || "–"}</td><td class="hide-s">${esc(IV[k].coll)}</td><td class="num">${byIv[k].length}</td><td>${prof(IV[k], k)}</td></tr>`).join("")}</tbody></table></div>`;
  const inp = $("#ivq"); inp.oninput = e => { state.ivq = e.target.value; const pos = e.target.selectionStart; vInterviews(); const n = $("#ivq"); n.focus(); n.setSelectionRange(pos, pos); };
}
function vInterview(k) {
  const iv = IV[k], ps = byIv[k];
  $("#view").innerHTML = `<p><button class="btn" data-back="1">All interviews</button></p>
    <div class="eyebrow">${esc(iv.coll)}</div><h2 class="view">${esc(iv.name)}</h2>
    <div class="ivhead"><span>${esc(iv.town)}${iv.approx ? " (approximate)" : ""}</span><span>${esc(iv.date || iv.year || "undated")}</span>${iv.intr ? `<span>Interviewer: ${esc(iv.intr)}</span>` : ""}<span>${ps.length} passages · ${ps.filter(p => p.c.length).length} coded</span></div>
    <p class="note">Long answers are split into overlapping windows, so a sentence can appear at the end of one passage and the start of the next.</p>
    <div class="filters">${CODES.filter(c => iv.prof[c.id]).map(c => `<span class="chip"><span class="cid">${c.id}</span>${esc(c.short)} ${iv.prof[c.id]}</span>`).join("")}</div>
    ${stripSvg(iv, ps)}
    <div class="ivpass">${ps.map(p => `<div class="ivp${p.c.length ? "" : " dim"}" id="p${p.i}">${p.q ? `<p class="turnq">${esc(p.q.length > 300 ? "… " + p.q.slice(-300) : p.q)}</p>` : ""}<p class="ptext" style="margin:0">${marked(p.t, p.c)}</p>${p.c.length ? `<div class="ptags">${codeChips(p)}</div>` : ""}</div>`).join("")}</div>`;
}

function stripSvg(iv, ps) {
  const rows = CODES.filter(c => (iv.strip[c.id] || "").match(/[13]/));
  if (!rows.length) return "";
  const n = ps.length, cw = Math.max(6, Math.min(16, 880 / n)), lw = 250, rh = 20, W = lw + n * cw + 10, H = rows.length * rh + 24;
  const body = rows.map((c, r) => { const s = iv.strip[c.id]; let g = `<text x="${lw - 8}" y="${r * rh + 14}" text-anchor="end" font-size="12" fill="var(--ink2)">${c.id} ${esc(CODE[c.id].short)}</text>`;
    for (let i = 0; i < s.length; i++) { const v = +s[i]; if (v >= 2) g += `<rect x="${lw + i * cw}" y="${r * rh + 2}" width="${cw}" height="${rh - 4}" fill="var(--accent)" opacity=".16"/>`;
      if (v % 2) g += `<circle cx="${lw + i * cw + cw / 2}" cy="${r * rh + rh / 2}" r="${Math.min(4, cw / 2 - .5)}" fill="var(--accent)" data-goto="p${ps[i]?.i}"><title>passage ${i + 1}</title></circle>`; }
    return g; }).join("");
  return `<div class="strip"><svg width="${W}" height="${H}" role="img" aria-label="Codes along the interview">${body}<text x="${lw}" y="${H - 4}" font-size="11.5" fill="var(--muted)">passage 1 → ${n}. Dots: coded passages. Bands: bursts (Kleinberg), where a code clusters in the telling.</text></svg></div>`;
}

/* ---------- search ---------- */
const SR = (() => {
  const raw = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  const S = D.search, d = S.dims, vix = new Map(S.vocab.map((w, i) => [w, i])), vvx = new Map(S.vvocab.map((w, i) => [w, i]));
  let Eq = null, Es, Wq, Ws, tf = null, norms = null;
  const tok = t => t.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z][a-z'\-]+/g) || [];
  function prep() {
    if (Eq) return;
    Eq = new Int8Array(raw(S.Eq)); Es = new Float32Array(raw(S.Es)); Wq = new Int8Array(raw(S.Wq)); Ws = new Float32Array(raw(S.Ws));
    tf = []; norms = new Float32Array(P.length);
    P.forEach((p, i) => { const m = new Map(); for (const w of tok(p.t)) { const k = vix.get(w); if (k != null) m.set(k, (m.get(k) || 0) + 1); }
      let n2 = 0; for (const [k, c] of m) { const v = (1 + Math.log(c)) * S.idf[k]; n2 += v * v; } norms[i] = Math.sqrt(n2) || 1; tf.push(m); });
  }
  function search(q) {
    prep();
    const words = tok(q);
    const ks = [...new Set(words.map(w => vix.get(w)).filter(k => k != null))];
    const vs = words.map(w => vvx.get(w)).filter(k => k != null);
    const n = P.length;
    if (!vs.length) return { ks, rows: [] };
    const sp = new Float32Array(n);
    if (ks.length) P.forEach((p, i) => { let s = 0; for (const k of ks) { const c = tf[i].get(k); if (c) s += (1 + Math.log(c)) * S.idf[k] * S.idf[k]; } sp[i] = s / norms[i]; });
    const qv = new Float32Array(d); for (const k of vs) { const sc = Ws[k]; for (let j = 0; j < d; j++) qv[j] += Wq[k * d + j] * sc; }
    let qn = 0; for (let j = 0; j < d; j++) qn += qv[j] * qv[j]; qn = Math.sqrt(qn) || 1;
    const de = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; const o = i * d; for (let j = 0; j < d; j++) s += Eq[o + j] * qv[j]; de[i] = s * Es[i] / qn; }
    const rank = arr => { const idx = [...arr.keys()].sort((a, b) => arr[b] - arr[a]); const r = new Int32Array(n); idx.forEach((i, k) => r[i] = k + 1); return r; };
    const rs = rank(sp), rd = rank(de);
    const rows = [...Array(n).keys()].map(i => ({ i, f: (sp[i] > 0 ? 1 / (60 + rs[i]) : 0) + 1 / (60 + rd[i]), kw: sp[i] > 0, mn: rd[i] <= 100 })).sort((a, b) => b.f - a.f);
    return { ks, rows };
  }
  return { search, tok, vocab: S.vocab };
})();
function vSearch() {
  const q = state.q.trim();
  let res = { ks: [], rows: [] };
  if (q) res = SR.search(q);
  let L = res.rows.filter(r => !state.qcode || has(P[r.i], state.qcode));
  const terms = res.ks.map(k => SR.vocab[k]);
  const missing = SR.tok(q).filter(w => !D.search.vvocab.includes(w));
  $("#view").innerHTML = `<div class="eyebrow">Search</div><h2 class="view">${q ? `Passages about “${esc(q)}”` : "Search what people said"}</h2>
    <p class="lede">Hybrid search, the same method as the pipeline: a keyword match (TF-IDF) and a meaning match (WordLlama embeddings), fused by reciprocal rank. The meaning match finds passages that say it in other words; each result says which signal found it.</p>
    ${missing.length && q ? `<p class="note">Not in the corpus vocabulary, so ignored: ${missing.map(esc).join(", ")}</p>` : ""}
    <div class="filters"><button class="chip${state.qcode ? "" : " on"}" data-qcode="">Any code</button>${CODES.map(k => `<button class="chip${k.id === state.qcode ? " on" : ""}" data-qcode="${k.id}"><span class="cid">${k.id}</span>${esc(k.short)}</button>`).join("")}</div>
    <div class="plist">${L.slice(0, 50).map(r => pItem(P[r.i], state.qcode || null, terms, `<span class="found">${r.kw && r.mn ? "words + meaning" : r.kw ? "words" : "meaning"}</span>`)).join("") || (q ? `<p class="empty">Nothing matched.</p>` : `<p class="empty">Try: the ocean is heating up, getting a license, helping each other at sea, losing the wharf, bait prices.</p>`)}</div>
    ${L.length > 50 ? `<p class="note">Showing the top 50.</p>` : ""}`;
}

/* ---------- story ---------- */
const ADV = { say: "Say it", care: "Use with care", leave: "Leave alone", know: "Know it when you hear it" };
const quoteBtn = ([i, q]) => { const iv = IV[P[i].iv]; return `<button class="qt" data-p="${i}">“${esc(q)}”<small>${esc(iv.name)}, ${esc(iv.forum ? iv.coll : iv.town || iv.coll)}${iv.year ? ", " + iv.year : ""}</small></button>`; };
function vStory() {
  const TH = D.story.threads;
  if (state.thread != null) {
    const th = TH[state.thread], L = th.ps.map(i => P[i]), per = 25, pg = state.thpage;
    $("#view").innerHTML = `<div class="filters"><button class="btn" data-thread="">← All threads</button></div>
      <div class="eyebrow">Story thread</div><h2 class="view">${esc(th.name)}</h2><p class="lede">${esc(th.desc)} ${fmt(L.length)} passages from ${fmt(new Set(L.map(p => p.iv)).size)} interviews.</p>
      <div class="plist">${L.slice(pg * per, pg * per + per).map(p => pItem(p)).join("")}</div>
      <div class="filters">${pg > 0 ? `<button class="btn" data-thpage="-1">Previous</button>` : ""}${(pg + 1) * per < L.length ? `<button class="btn" data-thpage="1">Next</button>` : ""}<span class="note">Page ${pg + 1} of ${Math.ceil(L.length / per)}</span></div>`;
    return;
  }
  const dated = IV.filter(iv => PERIODS.includes(iv.period));
  const perN = Object.fromEntries(PERIODS.map(pe => [pe, dated.filter(iv => iv.period === pe).length]));
  $("#view").innerHTML = `<div class="eyebrow">Story</div>
    <h2 class="view">Harder to get in, harder to stay ashore, harder to read the water, and much is gone</h2>
    <p class="lede">Four threads run through twenty years of interviews, across lobstermen, diggers, farmers and cannery workers. Each appears in every period from 2003 to 2025, so none is a recent complaint or one harbor's problem. A thread counts a passage when it carries the thread's code or falls in one of its topics. Click a quote to read it in context.</p>
    ${TH.map((th, k) => {
      const ivs = new Set(th.ps.map(i => P[i].iv)), colls = new Set([...ivs].map(v => IV[v].coll));
      const sh = pe => [...ivs].filter(v => IV[v].period === pe).length / perN[pe];
      return `<section class="thread"><h3>${esc(th.name)}</h3><div class="tmeta">${fmt(ivs.size)} interviews · ${colls.size} collections</div>
        <p class="lede" style="margin-top:8px">${esc(th.desc)}</p>
        <div class="pbars" aria-label="Share of interviews in each period">${PERIODS.map(pe => `<span title="${pe}: ${pct(sh(pe))} of ${perN[pe]} interviews">${pe} · ${pct(sh(pe))}<i><b style="width:${sh(pe) * 100}%"></b></i></span>`).join("")}</div>
        ${th.quotes.map(quoteBtn).join("")}
        <div class="filters"><button class="btn" data-thread="${k}">Read all ${fmt(th.ps.length)} passages</button></div></section>`;
    }).join("")}
    <section class="thread"><h3>What people say about agencies like NOAA</h3><div class="tmeta">What an official walks in against, and what earns a hearing</div>
      ${D.story.agency.map(quoteBtn).join("")}</section>
    <p class="note">Bars show the share of interviews in each period that touch the thread. Periods hold different projects asking different questions, so read them as presence over time, not trends.</p>`;
}

/* ---------- method ---------- */
function vMethod() {
  const [bl, ag] = D.agree;
  $("#view").innerHTML = `<div class="prose"><div class="eyebrow">Method</div><h2 class="view">How the passages were coded, and how far to trust it</h2>
    <ol class="steps">
      <li><div><b>Transcripts.</b> NOAA Voices sent ${fmt(IV.length + 2)} Maine transcript PDFs from 13 collections. Text was extracted, page furniture and line numbers removed, and duplicates of joint interviews merged.</div></li>
      <li><div><b>Speakers.</b> Each transcript was split into speaker turns and every label was assigned to narrator or interviewer, using the Voices metadata names. Only narrator speech is coded.</div></li>
      <li><div><b>Passages.</b> Each interviewer question and the narrator's answer form a passage of 25 to about 450 words: ${fmt(P.length)} in all.</div></li>
      <li><div><b>Codebook.</b> Five codes drafted by the team, with regulation split into rules, science and government, plus a candidate code for waterfront access that coders kept asking for. A 60-passage pilot set the excludes.</div></li>
      <li><div><b>Coding.</b> Claude Sonnet coded every passage through the Message Batches API, 15 passages per request, with the codebook cached. Each code needed a quote copied word for word from the narrator, checked by machine; failures were recoded one at a time.</div></li>
      <li><div><b>Agreement.</b> Claude Opus coded a blind sample of ${bl.n} passages, stratified by collection. Earlier agent coding of ${fmt(ag.n)} passages gives a second comparison.</div></li>
      <li><div><b>Discovery, without the codebook.</b> The flood pipeline's steps 7–10, unchanged: WordLlama embeddings of narrator speech; a UMAP meaning map; BERTopic (UMAP to 5 dimensions, HDBSCAN with at least 15 passages per topic, class TF-IDF labels), rerun on three more seeds to measure stability; ${D.run.n_topics} topics, ${pct(D.run.outlier_share)} of passages outliers.</div></li>
      <li><div><b>Search.</b> TF-IDF and embedding scores fused by reciprocal rank. In this page the meaning match rebuilds each query's WordLlama vector from its words' token embeddings, in a 192-dimension, 8-bit compression of the embedding space; on 15 test queries its top 20 results overlap the full model's by ${pct(D.run.search_check_top20_overlap)}.</div></li>
      <li><div><b>Places mentioned.</b> spaCy entities, coastal feature words and a local gazetteer, each name resolved to the matching place nearest the interview (voices_ai.places). The gazetteer here is postal place names, standing in for GNIS.</div></li>
      <li><div><b>Story threads.</b> Four threads (getting in, staying ashore, a changing ocean, what's gone) built from the codes and topics: a passage counts when it carries the thread's code (with a keyword match for getting in and what's gone) or falls in one of the thread's topics. Quotes were chosen by hand from coded evidence and checked against the transcript.</div></li>
      <li><div><b>Bursts.</b> Kleinberg burst detection along each interview, shown as strips on the interview pages. Across years, bursts would only rediscover the collections, as in the flood work.</div></li>
    </ol>
    <h3>Agreement between independent coders (Cohen's kappa)</h3>
    <table class="ktable"><thead><tr><th>Code</th><th>Blind sample, n=${bl.n}</th><th>Agent coding, n=${fmt(ag.n)}</th></tr></thead>
    <tbody>${CODES.map(c => `<tr><td><span class="mono">${c.id}</span> ${esc(c.short)}</td><td class="k">${bl[c.id].kappa.toFixed(2)}</td><td class="k">${ag[c.id].kappa.toFixed(2)}</td></tr>`).join("")}</tbody></table>
    <p class="note">Kappa above 0.6 is usually read as substantial agreement, above 0.8 as near perfect.</p>
    <h3>Caveats</h3><ul>
      <li>Both coders are AI models. A person should hand-code about 100 passages before counts are reported outside the team.</li>
      <li>Adaptation (M4) is the softest code; the main coder applies it more often than the comparison coders, so treat its counts as an upper bound.</li>
      <li>Each project asked different questions. The 2023–25 Seafood System interviews asked directly about environmental change and adaptation.</li>
      <li>Fishermen's Forum interviews are placed in Rockland, where the Forum is held.</li>
      <li>Ellsworth High School transcripts sometimes run student questions into the narrator's text. Across the corpus, about 2% of answer text comes from secondary speakers (second interviewers, spouses); 5 codes rest on such speech, and the one that quotes an interviewer's question was removed.</li>
      <li>Topics with no code yet: market gluts and consolidation, gear and technology change, passing knowledge on, young people leaving, cannery labor, safety and drugs.</li></ul>
    <h3>Use</h3><p>Voices oral histories are protected by copyright and shared for educational, research and personal use. Tell Voices@noaa.gov how they are being used before quoting them in public.</p>
    <p class="note">Built ${D.built}.</p></div>`;
}

/* ---------- reader ---------- */
function openReader(i) {
  const p = P[i], iv = IV[p.iv], pos = byIv[p.iv].indexOf(p);
  $("#reader").innerHTML = `<button class="btn close" data-close="1">Close</button>
    <div class="eyebrow">${esc(iv.coll)}</div><h2 class="view" style="font-size:22px">${esc(iv.name)}</h2>
    <div class="ivhead"><span>${esc(iv.town)}</span><span>${esc(iv.date || iv.year || "undated")}</span><span>passage ${pos + 1} of ${byIv[p.iv].length}</span></div>
    ${p.q ? `<div class="rq"><b>Question</b> ${esc(p.q)}</div>` : ""}
    <div class="rtext">${marked(p.t, p.c)}</div>
    <div class="filters">${p.tp >= 0 ? `<button class="chip" data-gotopic="${p.tp}">Topic: ${esc(TOPIC[p.tp].label.split(", ").slice(0, 3).join(", "))}</button>` : `<span class="chip">No topic (outlier)</span>`}${(p.pl || []).map(k => `<button class="chip" data-goplace="${k}">${esc(PLACES[k].name)}</button>`).join("")}</div>
    ${p.c.length ? `<div class="evlist">${p.c.map(([c, hi, ev]) => `<div class="evi"><b><span class="mono">${c}</span> ${esc(CODE[c].short)}</b> · ${hi ? "high" : "medium"} confidence<br>“${esc(ev)}”</div>`).join("")}</div>` : `<p class="note">No code applied.</p>`}
    <div class="filters"><button class="btn" data-goiv="${p.iv}" data-anchor="p${p.i}">Read the whole interview</button>${pos > 0 ? `<button class="btn" data-p="${byIv[p.iv][pos - 1].i}">Previous passage</button>` : ""}${pos < byIv[p.iv].length - 1 ? `<button class="btn" data-p="${byIv[p.iv][pos + 1].i}">Next passage</button>` : ""}</div>
    <h3 style="margin-top:22px;font-size:17px">Similar passages in other interviews</h3>
    <div class="plist">${p.nb.map(j => pItem(P[j])).join("")}</div>`;
  $("#reader").hidden = false; $("#scrim").hidden = false; $("#reader").scrollTop = 0;
}
function closeReader() { $("#reader").hidden = true; $("#scrim").hidden = true; }

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab],[data-gocode],[data-setcode],[data-heat],[data-page],[data-p],[data-mapcode],[data-town],[data-goiv],[data-back],[data-close],[data-qcode],[data-sort],[data-code],[data-topic],[data-tsort],[data-mmcode],[data-tpage],[data-layer],[data-place],[data-gotopic],[data-goplace],[data-goto],[data-thread],[data-thpage],[data-adv],[data-wsec]");
  if (!t) return;
  const d = t.dataset;
  if (d.tab) return go(d.tab, d.tab === "interviews" ? { iv: null } : d.tab === "story" ? { thread: null } : {});
  if (d.thread != null) { state.thread = d.thread === "" ? null : +d.thread; state.thpage = 0; vStory(); return window.scrollTo({ top: 0 }); }
  if (d.thpage) { state.thpage += +d.thpage; vStory(); return window.scrollTo({ top: 0 }); }
  if (d.goto) { const el = document.getElementById(d.goto); return el?.scrollIntoView({ block: "center", behavior: "smooth" }); }
  if (d.gotopic != null) { closeReader(); return go("topics", { topic: +d.gotopic, tpage: 0 }); }
  if (d.goplace != null) { closeReader(); return go("map", { layer: "mentioned", place: +d.goplace }); }
  if (d.topic != null) { state.topic = d.topic === "" ? null : +d.topic; state.tpage = 0; vTopics(); return window.scrollTo({ top: 0 }); }
  if (d.tsort) { state.tsort = d.tsort; return vTopics(); }
  if (d.mmcode != null) { state.mmcode = d.mmcode; return vTopics(); }
  if (d.tpage) { state.tpage += +d.tpage; return vTopics(); }
  if (d.layer) { state.layer = d.layer; return vMap(); }
  if (d.place != null && !d.p) { state.place = d.place === "" ? null : +d.place; return vMap(); }
  if (d.close) return closeReader();
  if (d.p != null && !d.goiv) return openReader(+d.p);
  if (d.goiv != null) { closeReader(); go("interviews", { iv: +d.goiv }); if (d.anchor) setTimeout(() => document.getElementById(d.anchor)?.scrollIntoView({ block: "center" }), 30); return; }
  if (d.back) return go("interviews", { iv: null });
  if (d.gocode) return go("codes", { code: d.gocode, coll: "", period: "", page: 0 });
  if (d.setcode) { state.code = d.setcode; state.page = 0; return vCodes(); }
  if (d.heat != null) { const [c, coll, per] = d.heat.split("|"); return go("codes", { code: c, coll: coll || "", period: per || "", page: 0 }); }
  if (d.page) { state.page += +d.page; vCodes(); return window.scrollTo({ top: 0 }); }
  if (d.mapcode) { state.code = d.mapcode; return vMap(); }
  if (d.town != null) { state.town = d.town || null; return vMap(); }
  if (d.qcode != null) { state.qcode = d.qcode; return vSearch(); }
  if (d.sort) { state.sort = d.sort; return vInterviews(); }
  if (d.code) { closeReader(); return go("codes", { code: d.code, coll: "", period: "", page: 0 }); }
});
$("#scrim").onclick = closeReader;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeReader(); if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("pitem")) { e.preventDefault(); openReader(+e.target.dataset.p); } });
$("#topsearch").onsubmit = e => { e.preventDefault(); go("search", { q: $("#q").value }); };
render();
