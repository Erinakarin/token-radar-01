/* Token Launch Radar — board rendering, filters, sorting, detail view. */
(function () {
  'use strict';

  var DATA = window.RADAR || { rows: [], live: [], meta: {} };
  var rows = DATA.rows || [];
  var live = DATA.live || [];

  var state = {
    tab: 'pre',
    query: '',
    category: '',
    chain: '',
    watchlistOnly: false,
    sortKey: 'rank',
    sortDir: 1,
    selected: null,
  };

  var $ = function (id) { return document.getElementById(id); };

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }

  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + s + '</span>';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort();
  }

  function fillSelect(el, values, label) {
    el.innerHTML = '<option value="">' + label + '</option>' +
      values.map(function (v) {
        return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
      }).join('');
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'detail' && v) state.selected = v;
      if (k === 'watchlist') state.watchlistOnly = true;
      if (k === 'category') state.category = v;
      if (k === 'chain') state.chain = v;
      if (k === 'q') state.query = v;
      if (k === 'tab' && (v === 'pre' || v === 'live')) state.tab = v;
    });
  }

  function applyHashToControls() {
    $('search').value = state.query;
    $('categoryFilter').value = state.category;
    $('chainFilter').value = state.chain;
    $('watchlistOnly').checked = state.watchlistOnly;
  }

  function currentList() {
    var list = state.tab === 'pre' ? rows : live;
    var q = state.query.trim().toLowerCase();
    return list.filter(function (r) {
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) === -1) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.tab === 'pre' && state.watchlistOnly && !r.watchlist) return false;
      return true;
    });
  }

  function sortList(list) {
    var key = state.sortKey;
    var dir = state.sortDir;
    return list.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
  }

  function renderBoard() {
    var list = sortList(currentList());
    var body = $('boardBody');
    var valueKey = state.tab === 'pre' ? 'implied_value_usd' : 'mcap_usd';
    document.querySelectorAll('#board th').forEach(function (th) {
      th.classList.remove('sorted-desc', 'sorted-asc');
      if (th.dataset.sort === state.sortKey) {
        th.classList.add(state.sortDir === 1 ? 'sorted-asc' : 'sorted-desc');
      }
    });
    body.innerHTML = list.map(function (r) {
      var first = state.tab === 'pre'
        ? '<td class="num">' + r.rank + '</td>'
        : '<td class="num">' + money(r.mcap_usd) + '</td>';
      var badge = state.tab === 'pre' && r.watchlist
        ? '<span class="badge">WATCHLIST</span>'
        : state.tab === 'live' ? '<span class="badge live-badge">LIVE</span>' : '';
      return '<tr data-slug="' + esc(r.slug) + '"' +
        (state.selected === r.slug ? ' class="selected"' : '') + '>' +
        first +
        '<td><strong>' + esc(r.name) + '</strong>' + badge + '<br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num"><strong>' + money(r[valueKey]) + '</strong></td>' +
        '</tr>';
    }).join('');
    $('emptyNote').hidden = list.length > 0;
    $('methodLine').textContent = state.tab === 'pre'
      ? list.length + ' pre-token protocols shown · ranked by implied launch value · ' + rows.filter(function (r) { return r.watchlist; }).length + ' on the watchlist'
      : list.length + ' protocols whose token already trades · shown apart with real market caps, never ranked';
  }

  function renderDetail() {
    var box = $('detail');
    var all = rows.concat(live);
    var r = all.find(function (x) { return x.slug === state.selected; });
    if (!r) {
      box.innerHTML = '<p class="detail-hint">Select a row to see its model breakdown and farm plan.</p>';
      return;
    }
    if (state.tab === 'live' || r.token_status !== 'pre-token') {
      box.innerHTML =
        '<h2>' + esc(r.name) + '</h2>' +
        '<p class="sub">' + esc(r.category || '—') + ' · ' + esc(r.chains.join(', ')) + ' · token ' + esc(r.symbol || '—') + ' already trades</p>' +
        '<div class="model-grid">' +
        '<div class="model-cell"><b>' + money(r.mcap_usd) + '</b><span>Market cap (real)</span></div>' +
        '<div class="model-cell"><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
        '<div class="model-cell"><b>' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b><span>TVL change, 7 days</span></div>' +
        '</div>' +
        '<h3>Why it is not ranked</h3>' +
        '<p>Its token already trades, so there is no launch left to value. The radar lists it apart so the pre-token board is never mixed with live market caps.</p>';
      return;
    }
    var m = r.model;
    var recomputed = Math.max(1, Math.round(r.tvl_usd * m.category_multiple * m.growth_factor * m.maturity_factor * m.chain_factor));
    var match = recomputed === r.implied_value_usd ? 'matches the board' : 'differs from the board';
    box.innerHTML =
      '<h2>' + esc(r.name) + (r.watchlist ? ' <span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(r.category || '—') + ' · ' + esc(r.chains.join(', ')) + ' · records no token · listed ' + esc(r.listed_at || 'unknown') + '</p>' +
      '<h3>Model breakdown</h3>' +
      '<div class="model-grid">' +
      '<div class="model-cell"><b>' + money(r.implied_value_usd) + '</b><span>Implied launch value</span></div>' +
      '<div class="model-cell"><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="model-cell"><b>' + m.category_multiple.toFixed(3) + '×</b><span>Category multiple</span></div>' +
      '<div class="model-cell"><b>' + m.growth_factor.toFixed(3) + '×</b><span>Growth factor (' + (m.growth_pct === null ? 'no 7d data' : (m.growth_pct > 0 ? '+' : '') + m.growth_pct.toFixed(1) + '%') + ')</span></div>' +
      '<div class="model-cell"><b>' + m.maturity_factor.toFixed(3) + '×</b><span>Maturity factor (' + (m.age_days === null ? 'age unknown' : m.age_days + ' days listed') + ')</span></div>' +
      '<div class="model-cell"><b>' + m.chain_factor.toFixed(2) + '×</b><span>Chain spread (' + r.chains.length + ' chains)</span></div>' +
      '</div>' +
      '<p class="formula">TVL ' + money(r.tvl_usd) + ' × ' + m.category_multiple.toFixed(3) + ' × ' + m.growth_factor.toFixed(3) + ' × ' + m.maturity_factor.toFixed(3) + ' × ' + m.chain_factor.toFixed(2) + ' = ' + money(recomputed) + ' — ' + match + '.</p>' +
      '<h3>Farm plan</h3>' +
      '<ol class="farm">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
  }

  function renderStats() {
    var top = rows[0];
    $('mastheadStats').innerHTML =
      '<div class="stat"><b>' + rows.length + '</b><span>ranked rows</span></div>' +
      '<div class="stat"><b>' + rows.filter(function (r) { return r.watchlist; }).length + '</b><span>watchlist</span></div>' +
      '<div class="stat"><b>' + money(top ? top.implied_value_usd : 0) + '</b><span>top implied value</span></div>';
  }

  function renderAll() {
    renderBoard();
    renderDetail();
  }

  function init() {
    fillSelect($('categoryFilter'), uniqueSorted(rows.concat(live).map(function (r) { return r.category; })), 'All categories');
    fillSelect($('chainFilter'), uniqueSorted(rows.concat(live).flatMap(function (r) { return r.chains; })), 'All chains');
    readHash();
    applyHashToControls();
    if (state.tab === 'live') {
      $('tabLive').classList.add('active');
      $('tabPre').classList.remove('active');
    }
    renderStats();
    renderAll();

    $('search').addEventListener('input', function (e) { state.query = e.target.value; renderBoard(); });
    $('categoryFilter').addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
    $('chainFilter').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
    $('watchlistOnly').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; renderBoard(); });
    $('tabPre').addEventListener('click', function () {
      state.tab = 'pre'; state.selected = null;
      $('tabPre').classList.add('active'); $('tabLive').classList.remove('active');
      renderAll();
    });
    $('tabLive').addEventListener('click', function () {
      state.tab = 'live'; state.selected = null;
      $('tabLive').classList.add('active'); $('tabPre').classList.remove('active');
      renderAll();
    });
    document.querySelectorAll('#board th').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = -state.sortDir;
        } else {
          state.sortKey = key;
          state.sortDir = key === 'rank' ? 1 : -1;
        }
        renderBoard();
      });
    });
    $('boardBody').addEventListener('click', function (e) {
      var tr = e.target.closest('tr');
      if (!tr) return;
      state.selected = tr.dataset.slug;
      renderBoard();
      renderDetail();
      $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  init();
})();
