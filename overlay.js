// Leverage Lens: a small card on Avanza product pages.
// Runs on www.avanza.se, so /_api calls are same-origin (no CORS, no host permissions).
(() => {
  if (window.top !== window) return;

  const PAGE_RE = /\/(om-warranten|om-certifikatet|om-aktien|om-indexet)\.html\/(\d+)/;
  const REFRESH_MS = 30000;
  const nf = (d) => new Intl.NumberFormat('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 2) => (v == null || !isFinite(v) ? '–' : nf(d).format(v));
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : '') + nf(d).format(v) + ' %');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ----- api -----
  // GETs carry the login cookie (real-time quotes when logged in). The filter POSTs are public
  // and go without it, so they never need the X-SecurityToken.
  async function get(path) {
    const r = await fetch('/_api/' + path, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status + ' ' + path);
    return r.json();
  }
  async function post(path, body) {
    const r = await fetch('/_api/' + path, {
      method: 'POST', credentials: 'omit',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(r.status + ' ' + path);
    return r.json();
  }
  // Products on one underlying (a stock or an index like Guld). Sorting is done by Avanza, so
  // "highest leverage" really is the top of everything, not of the first 500.
  const LIMIT = 500;
  const SORTS = {
    'lev-asc': { field: 'leverage', order: 'asc' },
    'lev-desc': { field: 'leverage', order: 'desc' },
    spread: { field: 'spread', order: 'asc' },
    traded: { field: 'totalValueTraded', order: 'desc' },
  };
  const listWarrants = (id, issuer, dir, sort) => post('market-warrant-filter/', {
    filter: { subTypes: [], issuers: issuer === 'ava' ? ['morgan stanley'] : [], underlyingInstruments: [id], endDates: [], directions: [dir], categories: [], exposures: [] },
    limit: LIMIT, offset: 0, sortBy: SORTS[sort],
  }).then((d) => d.warrants || []);
  const listCerts = (id, issuer, dir, sort) => post('market-certificate-filter/', {
    filter: { issuers: issuer === 'ava' ? ['morgan stanley'] : [], underlyingInstruments: [id], exposures: [], leverages: [], directions: [dir], categories: [] },
    limit: LIMIT, offset: 0, sortBy: SORTS[sort],
  }).then((d) => d.certificates || []);
  const todayChart = (u) => get(`price-chart/${String(u.instrumentType || 'stock').toLowerCase()}/${u.orderbookId}?timePeriod=today`).catch(() => null);

  const mid = (q) => (q && q.buy && q.sell ? (q.buy + q.sell) / 2 : q && (q.last || q.buy || q.sell));
  const spreadPct = (q) => (q && q.buy && q.sell ? ((q.sell - q.buy) / q.sell) * 100 : null);
  const productUrl = (type, id, name) => type === 'cert'
    ? `/borshandlade-produkter/certifikat-torg/om-certifikatet.html/${id}/${slug(name)}`
    : `/borshandlade-produkter/warranter-torg/om-warranten.html/${id}/${slug(name)}`;
  const stockUrl = (u) => (u.instrumentType === 'STOCK' ? `/aktier/om-aktien.html/${u.orderbookId}/${slug(u.name)}` : null);

  // ----- shell -----
  const host = document.createElement('div');
  host.id = 'leverage-lens';
  host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS());
  root.adoptedStyleSheets = [sheet];
  root.innerHTML = `
    <div class="card" data-theme="light">
      <header>
        <h1>Leverage Lens</h1>
        <div class="tools">
          <div class="hub-theme"><button class="theme" role="switch" aria-label="Dark theme"><i></i></button></div>
          <button class="icon min" aria-label="Minimise"><svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button>
        </div>
      </header>
      <div class="body"><p class="muted">Loading…</p></div>
      <section class="calc" hidden></section>
      <footer class="muted"></footer>
    </div>
    <button class="pill" hidden aria-label="Show Leverage Lens"><svg viewBox="0 0 24 24"><path d="M4 17l5-5 3 3 8-8"/><path d="M15 7h5v5"/></svg></button>`;
  const $ = (s) => root.querySelector(s);
  const card = $('.card'), body = $('.body'), foot = $('footer'), pill = $('.pill'), calc = $('.calc');

  // Fonts go through the FontFace API with bytes, so the page's CSP can't block them.
  for (const [fam, file] of [['Mona Sans Variable', 'mona-sans.woff2'], ['Hubot Sans Variable', 'hubot-sans.woff2']]) {
    fetch(chrome.runtime.getURL('fonts/' + file)).then((r) => r.arrayBuffer())
      .then((buf) => new FontFace(fam, buf, { weight: '200 900', stretch: '75% 125%' }).load())
      .then((f) => document.fonts.add(f)).catch(() => {});
  }

  const state = { theme: 'light', min: false, issuer: 'ava', type: 'all', sort: 'lev-asc' };
  const applyState = () => {
    card.dataset.theme = state.theme;
    pill.dataset.theme = state.theme;
    $('.theme').setAttribute('aria-checked', String(state.theme === 'dark'));
    card.hidden = state.min;
    pill.hidden = !state.min;
  };
  chrome.storage.local.get({ ...state, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }, (s) => {
    Object.assign(state, s); applyState();
  });
  const save = () => { chrome.storage.local.set(state); applyState(); };
  $('.theme').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); });
  $('.min').addEventListener('click', () => { state.min = true; save(); });
  pill.addEventListener('click', () => { state.min = false; save(); });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-dir]');
    if (t) { view.dir = t.dataset.dir; view.all = false; draw(); }
    if (e.target.closest('.more')) { view.all = !view.all; draw(); }
    // Issuer, type and sort are remembered across pages; changing them asks Avanza again.
    const o = e.target.closest('[data-opt]');
    if (o && state[o.dataset.opt] !== o.dataset.v) {
      state[o.dataset.opt] = o.dataset.v; view.all = false; save();
      draw();
      if (o.dataset.opt !== 'type') load(current);
    }
  });

  // ----- page tracking (Avanza is a single-page app) -----
  let current = null, timer = null, view = {}, last = null, seq = 0;
  function check() {
    const m = location.pathname.match(PAGE_RE);
    const key = m ? m[1] + ':' + m[2] : null;
    if (key === current) return;
    current = key;
    clearInterval(timer);
    if (!m) { host.remove(); return; }
    if (!host.isConnected) document.documentElement.append(host);
    body.innerHTML = '<p class="muted">Loading…</p>';
    calc.hidden = true;
    calc.dataset.id = '';
    foot.textContent = '';
    view = { kind: m[1], id: m[2], dir: 'long', all: false };
    last = null;
    load(key);
    timer = setInterval(() => document.visibilityState === 'visible' && load(key), REFRESH_MS);
  }
  setInterval(check, 700);
  check();

  async function load(key) {
    const mine = ++seq;
    body.classList.add('busy');
    try {
      let data;
      if (view.kind === 'om-warranten') data = await loadProduct('warrant');
      else if (view.kind === 'om-certifikatet') data = await loadProduct('certificate');
      else data = await loadStock();
      if (key !== current || mine !== seq) return;
      last = data;
      draw();
    } catch (err) {
      if (key !== current || mine !== seq) return;
      if (!last) body.innerHTML = `<p class="muted">Couldn't read this page from Avanza (${esc(err.message)}).</p>`;
    } finally {
      if (mine === seq) body.classList.remove('busy');
    }
  }

  async function loadProduct(type) {
    const d = await get(`market-guide/${type}/${view.id}`);
    const chart = d.underlying && d.underlying.orderbookId ? await todayChart(d.underlying) : null;
    return { type, d, chart };
  }

  async function loadStock() {
    // Always fetch both kinds, so the type buttons only filter what is already here.
    const { issuer, sort } = state;
    const w = (dir) => listWarrants(view.id, issuer, dir, sort).catch(() => []);
    const c = (dir) => listCerts(view.id, issuer, dir, sort).catch(() => []);
    const [s, wl, ws, cl, cs] = await Promise.all([
      get(view.kind === 'om-indexet' ? `market-index/${view.id}` : `market-guide/stock/${view.id}`),
      w('long'), w('short'), c('long'), c('short'),
    ]);
    return { type: 'stock', s, w: [...wl, ...ws], c: [...cl, ...cs], capped: [wl, ws, cl, cs].some((a) => a.length >= LIMIT), issuer };
  }

  function draw() {
    if (!last) return;
    if (last.type === 'stock') drawStock(last);
    else if (last.d.keyIndicators && last.d.keyIndicators.financingLevel != null) drawMini(last);
    else drawCert(last);
  }

  // ----- mini future / turbo -----
  function drawMini({ d, chart }) {
    const k = d.keyIndicators, u = d.underlying || {}, uq = u.quote || {};
    const spot = mid(uq);
    const long = !/kort|short/i.test(k.direction || '') && !/^(MINI|TURBO) S\b/i.test(d.name);
    const fin = k.financingLevel, stop = k.barrierLevel;
    const lev = spot && fin != null && spot !== fin ? spot / Math.abs(spot - fin) : k.leverage;
    const toStop = spot && stop ? ((stop - spot) / spot) * 100 : null; // negative for longs
    const ccy = (u.listing && u.listing.currency) || '';
    const room = toStop == null ? 0 : Math.min(1, Math.abs(toStop) / 50); // bar: 0 % to 50 % away
    body.innerHTML = `
      ${head(d, long ? 'Long' : 'Short', subTypeName(k.subType))}
      ${underlyingRow(u, spot, chart, stop)}
      <dl class="grid">
        <div><dt>Leverage now</dt><dd class="big">${num(lev, 2)}×</dd></div>
        <div><dt>1 % in ${esc(shortName(u))}</dt><dd class="big">${pct((long ? 1 : -1) * lev, 1)}</dd></div>
        <div><dt>Stop loss</dt><dd>${num(stop, 2)} ${esc(ccy)}</dd></div>
        <div><dt>Financing level</dt><dd>${num(fin, 2)} ${esc(ccy)}</dd></div>
      </dl>
      <div class="stop">
        <div class="row"><span>Distance to stop</span><b class="${Math.abs(toStop) < 5 ? 'red' : Math.abs(toStop) < 10 ? 'amber' : ''}">${pct(toStop, 1)}</b></div>
        <div class="bar"><i style="width:${(room * 100).toFixed(1)}%"></i></div>
        <p class="muted">Stopped out if ${esc(shortName(u))} ${long ? 'falls' : 'rises'} to ${num(stop, 2)}.</p>
      </div>
      ${quoteRow(d.quote)}`;
    footer(d.quote, uq);
    // The quote tells us the FX rate: price = |U - fin| / parity * fx.
    const q = d.quote || {}, now = mid(q), parity = k.parity || 1;
    const fx = now && spot && spot !== fin ? (now * parity) / Math.abs(spot - fin) : null;
    if (fx) showCalc({ id: d.orderbookId, long, fin, stop, parity, fx, spot, half: q.buy && q.sell ? (q.sell - q.buy) / 2 : 0, ticker: shortName(u) });
  }

  // ----- buy / sell calculator (minis only) -----
  // Lives outside .body so the 30 s refresh never wipes what you typed; refreshes only update the numbers.
  let model = null;
  function showCalc(m) {
    model = m;
    if (calc.dataset.id !== m.id) {
      calc.dataset.id = m.id;
      calc.innerHTML = `
        <div class="row"><b>Plan a trade</b>
          <span class="seg small-seg unit"><button data-unit="u" aria-pressed="true"></button><button data-unit="p" aria-pressed="false">SEK</button></span></div>
        <label class="in"><span>Buy at</span><input data-k="buy" inputmode="decimal" autocomplete="off"><output data-o="buy"></output></label>
        <label class="in"><span>Sell at</span><input data-k="sell" inputmode="decimal" autocomplete="off"><output data-o="sell"></output></label>
        <label class="in"><span>Amount</span><input data-k="amount" inputmode="decimal" autocomplete="off" placeholder="SEK"><output data-o="amount"></output></label>
        <p class="result muted"></p>`;
      calc.unit = 'u';
      const key = 'calc:' + m.id;
      chrome.storage.local.get({ [key]: null }, (s) => {
        const v = s[key];
        if (v) { calc.unit = v.unit || 'u'; for (const f of ['buy', 'sell', 'amount']) calc.querySelector(`[data-k="${f}"]`).value = v[f] || ''; }
        updateCalc();
      });
      calc.addEventListener('input', () => {
        const v = { unit: calc.unit };
        for (const f of ['buy', 'sell', 'amount']) v[f] = calc.querySelector(`[data-k="${f}"]`).value;
        chrome.storage.local.set({ [key]: v });
        updateCalc();
      });
      calc.addEventListener('click', (e) => {
        const b = e.target.closest('[data-unit]');
        if (!b || b.dataset.unit === calc.unit) return;
        // Switching units converts what is typed, so the plan stays the same.
        // Buy sits at the ask and sell at the bid, so the spread goes along with the conversion.
        for (const [f, sign] of [['buy', 1], ['sell', -1]]) {
          const el = calc.querySelector(`[data-k="${f}"]`), x = parse(el.value);
          if (x == null) continue;
          const v = b.dataset.unit === 'p' ? priceAt(x) + sign * model.half : levelAt(x - sign * model.half);
          el.value = String(+v.toFixed(b.dataset.unit === 'p' && v < 1 ? 3 : 2));
        }
        calc.unit = b.dataset.unit;
        calc.dispatchEvent(new Event('input'));
      });
    }
    calc.hidden = false;
    updateCalc();
  }
  const parse = (s) => { const x = parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : null; };
  const priceAt = (u) => Math.max(0, (model.long ? u - model.fin : model.fin - u) / model.parity * model.fx);
  const levelAt = (p) => (model.long ? model.fin + (p * model.parity) / model.fx : model.fin - (p * model.parity) / model.fx);
  const stopped = (u) => (model.long ? u <= model.stop : u >= model.stop);
  function updateCalc() {
    if (!model) return;
    const m = model, unitU = calc.unit === 'u';
    calc.querySelectorAll('[data-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === calc.unit)));
    calc.querySelector('[data-unit="u"]').textContent = m.ticker;
    for (const f of ['buy', 'sell']) calc.querySelector(`[data-k="${f}"]`).placeholder = unitU ? `${m.ticker} level` : 'Mini price';
    const out = (f, html) => { calc.querySelector(`[data-o="${f}"]`).innerHTML = html; };
    // Buying pays the ask, selling gets the bid: half the spread either side of the model price.
    const side = (f, sign) => {
      const x = parse(calc.querySelector(`[data-k="${f}"]`).value);
      if (x == null) { out(f, ''); return null; }
      const u = unitU ? x : levelAt(x);
      if (stopped(u)) { out(f, '<span class="red">stopped out</span>'); return null; }
      const p = unitU ? priceAt(u) + sign * m.half : x;
      const move = ((u - m.spot) / m.spot) * 100;
      out(f, unitU
        ? `<b>${num(p, p < 1 ? 3 : 2)}</b> SEK <span class="muted">${pct(move, 1)}</span>`
        : `<b>${num(u, 2)}</b> ${esc(m.ticker)} <span class="muted">${pct(move, 1)}</span>`);
      return { u, p };
    };
    const b = side('buy', +1), s = side('sell', -1);
    const amount = parse(calc.querySelector('[data-k="amount"]').value);
    const res = calc.querySelector('.result');
    if (b && s && b.p > 0) {
      const r = s.p / b.p - 1;
      out('amount', amount ? `<b>${num(Math.floor(amount / b.p), 0)}</b> st` : '');
      const sek = amount ? Math.floor(amount / b.p) * (s.p - b.p) : null;
      res.innerHTML = `Result <b class="${r >= 0 ? 'green' : 'red'}">${pct(r * 100, 1)}</b>${sek != null ? ` · <b class="${sek >= 0 ? 'green' : 'red'}">${sek >= 0 ? '+' : ''}${num(sek, 0)} SEK</b>` : ''}`;
    } else {
      out('amount', '');
      res.textContent = `Type a ${unitU ? m.ticker + ' level' : 'mini price'}. Buy is at the ask, sell at the bid, today's financing level.`;
    }
  }

  // ----- BULL / BEAR daily reset -----
  function drawCert({ d, chart }) {
    const k = d.keyIndicators || {}, u = d.underlying || {}, uq = u.quote || {}, q = d.quote || {};
    const long = !/^BEAR\b/i.test(d.name);
    const L = k.leverage || 1;
    const spot = mid(uq);
    const uMove = u.previousClosingPrice && spot ? (spot / u.previousClosingPrice - 1) * 100 : uq.changePercent;
    const expected = (long ? 1 : -1) * L * uMove;
    const mmClose = d.historicalClosingPrices && d.historicalClosingPrices.marketMaker && d.historicalClosingPrices.marketMaker.oneDay;
    const now = mid(q.marketMakerQuote ? { buy: q.marketMakerQuote.currentBuyPrice, sell: q.marketMakerQuote.currentSellPrice } : q);
    const actual = mmClose && now ? (now / mmClose - 1) * 100 : null;
    const h = d.historicalClosingPrices || {};
    const perf = (p) => (p && now ? pct((now / p - 1) * 100, 0) : '–');
    body.innerHTML = `
      ${head(d, long ? 'Long' : 'Short', L === 1 ? 'Tracker' : 'Daily reset')}
      ${u.orderbookId ? underlyingRow(u, spot, chart) : ''}
      <dl class="grid">
        <div><dt>Leverage</dt><dd class="big">${num(L, L % 1 ? 1 : 0)}×</dd></div>
        <div><dt>1 % in ${esc(shortName(u))}</dt><dd class="big">${pct((long ? 1 : -1) * L, 1)}</dd></div>
        <div><dt>${esc(shortName(u))} today ×${num(L, L % 1 ? 1 : 0)}</dt><dd>${pct(expected, 1)}</dd></div>
        <div><dt>Bid vs last close</dt><dd>${pct(actual, 1)}</dd></div>
      </dl>
      ${L > 1 ? `<p class="muted note">Resets every day, so over weeks it drifts away from ${num(L, 0)}× the ${esc(shortName(u))} move. Worthless if ${esc(shortName(u))} ${long ? 'falls' : 'rises'} ${num(100 / L, 0)} % in one day.</p>` : ''}
      <dl class="grid perf">
        <div><dt>1 week</dt><dd>${perf(h.oneWeek)}</dd></div>
        <div><dt>1 month</dt><dd>${perf(h.oneMonth)}</dd></div>
        <div><dt>3 months</dt><dd>${perf(h.threeMonths)}</dd></div>
        <div><dt>Since start</dt><dd>${perf(h.start)}</dd></div>
      </dl>
      ${quoteRow(q)}`;
    footer(q, uq);
  }

  // ----- stock page: AVA products on it -----
  function drawStock({ s, w, c, capped, issuer }) {
    const sq = s.quote || {};
    const spot = mid(sq);
    // A mini's own underlying level, solved from Avanza's leverage. Gold minis run on spot or on a
    // future, so when that level is far from the page's price, trust the product over the page.
    const own = (x) => {
      const L = x.leverage, f = x.financingLevel;
      if (!L || f == null) return spot;
      const u = x.direction === 'short' ? (L * f) / (L + 1) : L > 1 ? (L * f) / (L - 1) : spot;
      return spot && Math.abs(u / spot - 1) < 0.03 ? spot : u;
    };
    const ava = (x) => /morgan stanley/i.test(x.issuer || '');
    const keep = (x) => x.buyPrice && (state.issuer === 'all' || ava(x));
    const rows = [
      ...(state.type === 'cert' ? [] : w).filter(keep).map((x) => {
        const u = own(x);
        return {
          id: x.orderbookId, name: x.name, type: 'warrant', dir: x.direction,
          lev: x.financingLevel != null && u ? u / Math.abs(u - x.financingLevel) : x.leverage,
          stop: x.stopLoss != null && u ? ((x.stopLoss - u) / u) * 100 : null,
          spread: x.spread != null ? x.spread * 100 : null, traded: x.totalValueTraded || 0,
        };
      }),
      ...(state.type === 'mini' ? [] : c).filter(keep).map((x) => ({
        id: x.orderbookId, name: x.name, type: 'cert', dir: x.direction,
        lev: x.leverage, stop: null, spread: x.spread != null ? x.spread * 100 : null, traded: x.totalValueTraded || 0,
      })),
    ];
    const by = {
      'lev-asc': (a, b) => a.lev - b.lev,
      'lev-desc': (a, b) => b.lev - a.lev,
      spread: (a, b) => (a.spread ?? 1e9) - (b.spread ?? 1e9),
      traded: (a, b) => b.traded - a.traded,
    }[state.sort];
    const longN = rows.filter((r) => r.dir === 'long').length, shortN = rows.length - longN;
    const controls = optionRows(state);
    if (!rows.length) {
      body.innerHTML = `${stockHead(s)}${controls}<p class="muted">Nothing here with these filters.</p>`;
      footer(null, sq);
      return;
    }
    if (view.dir === 'short' && !shortN) view.dir = 'long';
    if (view.dir === 'long' && !longN) view.dir = 'short';
    const list = rows.filter((r) => r.dir === view.dir).sort(by);
    const shown = view.all ? list : list.slice(0, 10);
    body.innerHTML = `
      ${stockHead(s)}
      ${controls}
      <div class="seg">
        <button data-dir="long" aria-pressed="${view.dir === 'long'}">Long ${longN}${capped ? '+' : ''}</button>
        <button data-dir="short" aria-pressed="${view.dir === 'short'}">Short ${shortN}${capped ? '+' : ''}</button>
      </div>
      <table>
        <thead><tr><th>Product</th><th>Lev.</th><th>To stop</th><th>Spread</th></tr></thead>
        <tbody>${shown.map((r) => `
          <tr><td><a href="${productUrl(r.type, r.id, r.name)}" title="${esc(r.name)}">${esc(trimName(r.name))}</a></td>
          <td>${num(r.lev, r.lev < 10 ? 2 : 1)}×</td>
          <td class="${r.stop != null && Math.abs(r.stop) < 5 ? 'red' : ''}">${r.stop == null ? '<span class="muted">reset</span>' : pct(r.stop, 1)}</td>
          <td>${r.spread == null ? '–' : num(r.spread, 2) + ' %'}</td></tr>`).join('')}
        </tbody>
      </table>
      ${list.length > shown.length || view.all ? `<button class="more">${view.all ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}`;
    footer(null, sq);
  }

  // The stock is already in the header: "MINI L MICRON AVA 6" -> "MINI L AVA 6", "BULL MICRON X2 AVA 1" -> "BULL X2 AVA 1".
  const trimName = (n) => n.replace(/^(MINI [LS]|TURBO [LS]|BULL|BEAR)\s+.+?\s+(?=(X\d+\s+)?AVA\b)/, '$1 ');

  function optionRows(o) {
    const seg = (opt, items) => `<div class="seg small-seg">${items.map(([v, label]) =>
      `<button data-opt="${opt}" data-v="${v}" aria-pressed="${o[opt] === v}">${label}</button>`).join('')}</div>`;
    return `<div class="opts">
      ${seg('issuer', [['ava', 'AVA'], ['all', 'All issuers']])}
      ${seg('type', [['all', 'All'], ['mini', 'Mini/turbo'], ['cert', 'Bull/Bear']])}
      ${seg('sort', [['lev-asc', 'Lev ↑'], ['lev-desc', 'Lev ↓'], ['spread', 'Spread'], ['traded', 'Traded']])}
    </div>`;
  }

  // ----- pieces -----
  function head(d, dir, kind) {
    return `<div class="title"><b>${esc(d.name)}</b><span class="tags"><span class="tag">${dir}</span><span class="tag">${esc(kind)}</span>${d.keyIndicators && d.keyIndicators.isAza ? '<span class="tag">AVA</span>' : ''}</span></div>`;
  }
  function stockHead(s) {
    const q = s.quote || {};
    // Avanza labels every index SEK, so an index shows plain points.
    const ccy = view.kind === 'om-indexet' ? '' : (s.listing && s.listing.currency) || '';
    return `<div class="title"><b>${esc(s.name)}</b><span class="muted">${num(q.last, 2)} ${esc(ccy)} <span class="${q.changePercent >= 0 ? 'green' : 'red'}">${pct(q.changePercent, 2)}</span></span></div>`;
  }
  function underlyingRow(u, spot, chart, stop) {
    const uq = u.quote || {}, url = stockUrl(u), ccy = (u.listing && u.listing.currency) || '';
    const move = u.previousClosingPrice && spot ? (spot / u.previousClosingPrice - 1) * 100 : uq.changePercent;
    return `<div class="under">
      <div class="row"><span>${url ? `<a href="${url}">${esc(u.name)}</a>` : esc(u.name || 'Underlying')}</span>
        <span><b>${num(spot, 2)}</b> ${esc(ccy)} <span class="${move >= 0 ? 'green' : 'red'}">${pct(move, 2)}</span></span></div>
      ${spark(chart, stop)}
    </div>`;
  }
  function spark(chart, stop) {
    const pts = chart && chart.ohlc ? chart.ohlc.map((p) => p.close).filter((v) => v != null) : [];
    if (pts.length < 2) return '';
    const prev = chart.previousClosingPrice;
    let lo = Math.min(...pts), hi = Math.max(...pts);
    if (prev) { lo = Math.min(lo, prev); hi = Math.max(hi, prev); }
    const showStop = stop && stop > lo - (hi - lo) * 0.6 && stop < hi + (hi - lo) * 0.6;
    if (showStop) { lo = Math.min(lo, stop); hi = Math.max(hi, stop); }
    const W = 268, H = 44, pad = 3, span = hi - lo || 1;
    const y = (v) => (pad + (1 - (v - lo) / span) * (H - 2 * pad)).toFixed(1);
    const line = pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${y(v)}`).join(' ');
    const up = pts[pts.length - 1] >= (prev || pts[0]);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${prev ? `<line class="prev" x1="0" x2="${W}" y1="${y(prev)}" y2="${y(prev)}"/>` : ''}
      ${showStop ? `<line class="stopline" x1="0" x2="${W}" y1="${y(stop)}" y2="${y(stop)}"/>` : ''}
      <polyline class="${up ? 'up' : 'down'}" points="${line}"/>
    </svg>`;
  }
  function quoteRow(q) {
    if (!q) return '';
    return `<div class="row quote"><span class="muted">Bid / ask</span><span>${num(q.buy, 2)} / ${num(q.sell, 2)} <span class="muted">· spread ${num(spreadPct(q), 2)} %</span></span></div>`;
  }
  function footer(q, uq) {
    const delayed = (q && q.isRealTime === false) || (uq && uq.isRealTime === false);
    const t = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    foot.textContent = `${delayed ? 'Quotes 15 min delayed. ' : ''}Updated ${t}.`;
  }
  const shortName = (u) => (u && u.listing && u.listing.tickerSymbol) || (u && u.name) || 'underlying';
  const subTypeName = (s) => ({ MINI_FUTURE: 'Mini future', KNOCK_OUT: 'Knock-out', TURBO: 'Turbo' })[s] || 'Warrant';

  function CSS() {
    return `
    :host { all: initial; }
    .card, .pill {
      --h-font: "Mona Sans Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --h-head: "Hubot Sans Variable", var(--h-font);
      --h-bg: #f1efe9; --h-panel: #faf9f5; --h-border: #dedad0; --h-border2: #d3cec2;
      --h-btn: #ffffff; --h-btn-border: #cfcabe; --h-btn-hover: #f1eee6;
      --h-text: #18181b; --h-muted: #6b675f; --h-accent: #18181b; --h-on-accent: #ffffff;
      --h-green: #1a7f37; --h-red: #cf222e; --h-amber: #9a6700;
      --h-title-shadow: 0 2px 3px rgba(24, 24, 27, .16), 0 8px 22px rgba(24, 24, 27, .18);
      --shadow: 0 1px 2px rgba(24,24,27,.08), 0 12px 32px rgba(24,24,27,.18);
    }
    [data-theme="dark"] {
      --h-bg: #1e1f24; --h-panel: #26272e; --h-border: #3a3b44; --h-border2: #3a3b46;
      --h-btn: #33343d; --h-btn-border: #4a4b55; --h-btn-hover: #41424d;
      --h-text: #e6e6e6; --h-muted: #8a8b94; --h-accent: #e6e6e6; --h-on-accent: #18181b;
      --h-green: #3fb950; --h-red: #f85149; --h-amber: #e3b341;
      --h-title-shadow: 0 2px 3px rgba(0, 0, 0, .45), 0 8px 22px rgba(0, 0, 0, .5);
      --shadow: 0 12px 32px rgba(0,0,0,.5);
    }
    [hidden] { display: none !important; }
    * { box-sizing: border-box; }
    .card { width: 320px; max-height: calc(100vh - 32px); overflow: hidden auto; padding: 12px 14px 10px;
      background: var(--h-bg); color: var(--h-text); border: 1px solid var(--h-border2); border-radius: 16px;
      box-shadow: var(--shadow); font: 13px/1.4 var(--h-font); font-variant-numeric: tabular-nums; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    h1 { margin: 0; font: 800 15px/1.1 var(--h-head); font-stretch: 125%; letter-spacing: -.02em; text-shadow: var(--h-title-shadow); }
    .tools { display: flex; align-items: center; gap: 6px; }
    button { font: inherit; color: var(--h-text); background: var(--h-btn); border: 1px solid var(--h-btn-border); border-radius: 8px; padding: 4px 9px; cursor: pointer; }
    button:hover { background: var(--h-btn-hover); }
    svg { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .icon { width: 24px; height: 24px; padding: 3px; display: grid; place-items: center; }
    .icon svg { width: 16px; height: 16px; }
    .pill { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--h-bg);
      border: 1px solid var(--h-border2); color: var(--h-text); box-shadow: var(--shadow); }
    .pill svg { width: 22px; height: 22px; }
    .muted { color: var(--h-muted); }
    .small { font-size: 12px; margin: 2px 0 8px; }
    a { color: inherit; text-decoration: underline; text-decoration-color: var(--h-border2); text-underline-offset: 2px; }
    a:hover { text-decoration-color: currentColor; }
    .green { color: var(--h-green); } .red { color: var(--h-red); } .amber { color: var(--h-amber); }
    .title { display: grid; gap: 4px; margin-bottom: 8px; }
    .title b { font-size: 14px; }
    .tags { display: flex; gap: 4px; flex-wrap: wrap; }
    .tag { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--h-border2); color: var(--h-muted); }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .under, .stop, .grid, table { background: var(--h-panel); border: 1px solid var(--h-border); border-radius: 12px; }
    .under { padding: 8px 10px 6px; margin-bottom: 8px; }
    .spark { display: block; width: 100%; height: 44px; margin-top: 6px; }
    .spark polyline { stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .spark .up { stroke: var(--h-green); } .spark .down { stroke: var(--h-red); }
    .spark line { stroke-width: 1; vector-effect: non-scaling-stroke; }
    .spark .prev { stroke: var(--h-muted); stroke-dasharray: 3 3; }
    .spark .stopline { stroke: var(--h-red); stroke-dasharray: 5 3; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; padding: 9px 10px; margin: 0 0 8px; }
    .grid div { min-width: 0; }
    dt { font-size: 11px; color: var(--h-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    dd { margin: 1px 0 0; font-weight: 600; }
    dd.big { font: 800 18px/1.15 var(--h-head); font-stretch: 110%; }
    .perf { grid-template-columns: repeat(4, 1fr); }
    .stop { padding: 8px 10px; margin-bottom: 8px; }
    .stop p { margin: 4px 0 0; font-size: 12px; }
    .bar { height: 6px; margin-top: 6px; border-radius: 999px; background: var(--h-border); overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--h-text); border-radius: 999px; }
    .note { font-size: 12px; margin: -2px 0 8px; }
    .quote { font-size: 12px; padding: 0 2px; }
    footer { margin-top: 8px; font-size: 11px; }
    .seg { display: inline-flex; border: 1px solid var(--h-btn-border); border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
    .seg button { border: 0; border-radius: 0; padding: 4px 12px; }
    .seg button + button { border-left: 1px solid var(--h-btn-border); }
    .seg button[aria-pressed="true"] { background: var(--h-accent); color: var(--h-on-accent); }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; overflow: hidden; }
    th { text-align: right; font-weight: 500; color: var(--h-muted); font-size: 11px; padding: 6px 6px 4px; }
    td { text-align: right; padding: 4px 6px; border-top: 1px solid var(--h-border); white-space: nowrap; }
    th:first-child, td:first-child { text-align: left; }
    td:first-child { max-width: 128px; overflow: hidden; text-overflow: ellipsis; }
    .more { width: 100%; margin-top: 8px; }
    .calc { margin-top: 8px; padding: 9px 10px; display: grid; gap: 6px; background: var(--h-panel); border: 1px solid var(--h-border); border-radius: 12px; }
    .calc .unit { margin: 0; }
    .calc .unit button { padding: 2px 9px; font-size: 11.5px; }
    .in { display: grid; grid-template-columns: 50px 92px 1fr; align-items: center; gap: 8px; font-size: 12px; }
    .in span { color: var(--h-muted); }
    .in input { width: 100%; font: inherit; font-variant-numeric: tabular-nums; color: var(--h-text); background: var(--h-btn);
      border: 1px solid var(--h-btn-border); border-radius: 8px; padding: 4px 7px; outline: none; }
    .in input:focus { border-color: var(--h-text); }
    .in output { text-align: right; white-space: nowrap; }
    .result { margin: 2px 0 0; font-size: 12px; }
    .body { transition: opacity .15s; }
    .body.busy { opacity: .55; }
    .opts { display: grid; gap: 6px; margin-bottom: 8px; }
    .opts .seg { margin: 0; width: 100%; display: flex; }
    .opts .seg button { flex: 1; padding: 3px 4px; font-size: 11.5px; }
    .hub-theme button { all: unset; box-sizing: border-box; position: relative; display: block; width: 40px; height: 18px; border-radius: 999px; cursor: pointer;
      background: linear-gradient(90deg, #f1efe9, #c9c4b7 38%, #3f3f46 62%, #09090b); border: 1px solid var(--h-border2); }
    .hub-theme i { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.08); transition: left .4s cubic-bezier(.65, 0, .35, 1); }
    [data-theme="dark"] .hub-theme i { left: 24px; }
    `;
  }
})();
