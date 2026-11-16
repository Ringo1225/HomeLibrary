(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s·•・\-—_.,，。:：《》<>()（）'"“”‘’!！?？]/g, '');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hl.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('hl.' + k, JSON.stringify(v)); } catch {} },
  };
  const state = {
    books: [], series: [], byId: new Map(),
    tab: store.get('tab', 'home'), q: '', view: store.get('view', 'shelf'), firstShelf: true, sort: store.get('sort', 'py'),
    status: 'owned', cats: new Set(), pubs: new Set(), seriesOnly: false, pubMore: false,
    seriesFilter: 'all', barCat: null, skin: store.get('skin', 'graphite'),
  };

  const ICONS = {
    home: '<svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>',
    books: '<svg viewBox="0 0 24 24"><path d="M5 4h3v16H5zM10 4h3v16h-3zM15.5 5.2l2.9-.8 3.6 15.4-2.9.8z"/></svg>',
    series: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/></svg>',
    wanted: '<svg viewBox="0 0 24 24"><path d="M6 6h15l-1.5 9h-12zM6 6 5 3H2M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01"/></svg>',
  };
  const TABS = [['home', '首页'], ['books', '书目'], ['series', '套书'], ['wanted', '想买']];

  // ---------- color ----------
  const CAT = {
    '小说': '#e0705a', '散文随笔': '#e2a64a', '历史': '#b4835b', '哲学心理': '#8a78d8', '古典文学': '#c46a5a',
    '投资理财': '#4fa27a', '健康生活': '#8fbf6e', '音乐艺术': '#d47fb0', '经济管理': '#4f7fd0', '英文原版': '#3f9bbf',
    '外语': '#67b7c9', '考试教辅': '#c9b443', '数学科普': '#5b6fe0', '政治思想': '#7d7a86', '计算机': '#5f8a9e',
    '法律': '#56606b', '传记回忆': '#c08c5a', '其他': '#a0a0a8', '未分类': '#a0a0a8',
  };
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + rgb(a).map((x, i) => Math.round(x + (rgb(b)[i] - x) * t).toString(16).padStart(2, '0')).join('');
  function paint(b) {
    const base = CAT[b.category] || CAT['其他'];
    const h = hash(b.series || b.title);
    const t = [.78, .72, .84, .66][h % 4];
    return { c1: mix(base, '#ffffff', t), c2: mix(base, '#ffffff', t - .14), ct: mix(base, '#000000', .55), dot: base };
  }

  // ---------- pinyin / index ----------
  const py = window.pinyinPro;
  const pyFull = (t) => (py && t ? norm(py.pinyin(t, { toneType: 'none', type: 'array', v: true }).join('')) : norm(t));
  const pyFirst = (t) => (py && t ? norm(py.pinyin(t, { pattern: 'first', toneType: 'none', type: 'array' }).join('')) : '');
  const letterOf = (s) => { const c = (s || '').charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
  function indexBook(b) {
    const f = [b.title, b.author, b.translator, b.publisher, b.series].filter(Boolean);
    b._plain = norm(f.join('|')); b._full = f.map(pyFull).join('|'); b._first = f.map(pyFirst).join('|');
    b._sort = b.series && b.volume ? pyFull(b.series) + '#' + String(b.volume).padStart(4, '0') : pyFull(b.title);
    b._letter = letterOf(b._sort); b._auth = pyFull(b.author || '') || '~'; b._aLetter = b.author ? letterOf(b._auth) : '#';
    b._pub = pyFull(b.publisher || '') || '~'; b._p = paint(b); b._s = spineColor(b);
  }
  const matches = (b, q) => !q || b._plain.includes(q) || (/^[a-z0-9]+$/.test(q) && (b._full.includes(q) || b._first.includes(q)));
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const SORTS = {
    py: { label: '书名', fn: (a, b) => cmp(a._sort, b._sort), group: (b) => b._letter, rail: true },
    author: { label: '作者', fn: (a, b) => cmp(a._auth, b._auth) || cmp(a._sort, b._sort), group: (b) => b._aLetter, rail: true },
    pub: { label: '出版社', fn: (a, b) => cmp(a._pub, b._pub) || cmp(a._sort, b._sort), group: (b) => b.publisher || '未记录出版社' },
    recent: { label: '最近', fn: (a, b) => cmp(b.id, a.id), group: () => '最近录入' },
  };
  function hl(text, rawQ) {
    const s = String(text ?? ''); const q = rawQ.trim(); if (!q) return esc(s);
    const at = s.toLowerCase().indexOf(q.toLowerCase()); if (at < 0) return esc(s);
    return esc(s.slice(0, at)) + '<mark>' + esc(s.slice(at, at + q.length)) + '</mark>' + esc(s.slice(at + q.length));
  }

  // ---------- series ----------
  let _series = null;
  function seriesInfo() {
    if (_series) return _series;
    const defs = new Map(state.series.map((s) => [s.name, s]));
    const names = new Set(defs.keys()); state.books.forEach((b) => b.series && names.add(b.series));
    _series = [...names].map((name) => {
      const def = defs.get(name) || {};
      const members = state.books.filter((b) => b.series === name).sort((a, b) => (a.volume || 0) - (b.volume || 0));
      const have = new Map(members.filter((b) => b.status === 'owned' && b.volume).map((b) => [b.volume, b]));
      const want = new Set(members.filter((b) => b.status === 'wanted' && b.volume).map((b) => b.volume));
      const total = def.total || null; const missing = [];
      if (total) for (let v = 1; v <= total; v++) if (!have.has(v)) missing.push(v);
      const owned = members.filter((b) => b.status === 'owned');
      return { name, total, members, owned, have, want, missing, author: def.author || members[0]?.author || '', publisher: def.publisher || members[0]?.publisher || '', _py: pyFull(name), _first: pyFirst(name) };
    }).sort((a, b) => (b.missing.length > 0) - (a.missing.length > 0) || cmp(a._py, b._py));
    return _series;
  }

  // ---------- filtering ----------
  const statusOk = (b, s) => s === 'all' || (s === 'low' ? b.confidence === 'low' : b.status === s);
  const filtered = ({ ignoreCats = false, ignorePubs = false } = {}) => state.books.filter((b) => statusOk(b, state.status)
    && (ignoreCats || !state.cats.size || state.cats.has(b.category || '未分类'))
    && (ignorePubs || !state.pubs.size || state.pubs.has(b.publisher || '未记录'))
    && (!state.seriesOnly || b.series));
  const activeFilters = () => (state.status !== 'owned' ? 1 : 0) + state.cats.size + state.pubs.size + (state.seriesOnly ? 1 : 0);
  const countBy = (list, key) => { const m = new Map(); list.forEach((b) => { const k = key(b); m.set(k, (m.get(k) || 0) + 1); }); return m; };

  // ---------- pieces ----------
  const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  function spineColor(b) {
    const base = CAT[b.category] || CAT['其他']; const h = hash(b.series || b.title);
    const sh = [0, .16, -.14, .3, -.26][h % 5];
    const c = sh >= 0 ? mix(base, '#ffffff', sh) : mix(base, '#000000', -sh);
    return { c, t: lum(c) > .18 ? '#1c1c1e' : '#ffffff' };
  }
  function spine(b, i = 0) {
    const h = hash(b.id + b.title);
    const m = b.title.match(/^(.+?)[：:](.+)$/); const top = m ? m[1] : ''; const main = m ? m[2] : b.title;
    const len = [...main].length; const tl = Math.min([...top].length, 6);
    const latin = /^[\x00-\x7f]+$/.test(main.replace(/\s/g, ''));
    const fs = len <= 4 ? 15 : len <= 8 ? 14 : len <= 11 ? 12.5 : 11.5;
    const need = Math.min(len, 12) * (fs + 1) + 44 + (tl ? tl * 10 + 7 : 0);
    const H = Math.max(116, Math.min(172, need + (h % 28)));
    const W = 26 + (h >> 5) % 14 + (len > 10 ? 4 : 0);
    const { c, t } = b._s;
    const cls = ['spine', ['', 'f1', 'f2', ''][(h >> 9) % 4], b.confidence === 'low' ? 'low' : '', b.status === 'wanted' ? 'wanted' : '', b.volume ? 'hv' : ''].join(' ');
    return `<div class="slot${h % 47 === 0 ? ' lean' : ''}${i > 40 ? ' still' : ''}" style="--i:${i}"><button class="${cls}" data-book="${b.id}" aria-label="${esc(b.title)}${b.author ? '，' + esc(b.author) : ''}" style="--w:${W}px;--h:${H}px;--c:${c};--t:${t};--fs:${fs}px">${top ? `<span class="top">${esc(top)}</span>` : ''}<span class="tt${latin ? ' mixed' : ''}">${esc(main)}</span>${b.volume ? `<span class="vn">${b.volume}</span>` : ''}</button></div>`;
  }
  function cover(b, { caption = true } = {}) {
    const len = [...b.title].length;
    const fs = len <= 4 ? 17 : len <= 8 ? 15 : len <= 14 ? 13 : 12;
    const tag = caption ? 'button' : 'div';
    return `<${tag} class="cv"${caption ? ` data-book="${b.id}" aria-label="${esc(b.title)}"` : ' aria-hidden="true"'} style="--c1:${b._p.c1};--c2:${b._p.c2};--ct:${b._p.ct};--fs:${fs}px">
      <div class="art"><div class="t">${esc(b.title)}</div><div class="a">${esc(b.author || '')}</div>
      ${b.volume ? `<div class="vol num">${b.volume}</div>` : ''}${b.status === 'wanted' ? '<div class="flag">想买</div>' : b.confidence === 'low' ? '<div class="flag">待核对</div>' : ''}</div>
      ${caption ? `<div class="cap">${esc(b.title)}</div><div class="cap2">${esc(b.author || b.publisher || '')}</div>` : ''}</${tag}>`;
  }
  function row(b, rawQ = '') {
    const first = [...(b.title.replace(/^[《「“"(（\s]+/, '') || '书')][0];
    const tags = [b.series && b.volume ? `<span class="tag">第${b.volume}册</span>` : '', b.status === 'wanted' ? '<span class="tag hot">想买</span>' : '', b.confidence === 'low' ? '<span class="tag hot">待核对</span>' : ''].join('');
    const m = [b.author, b.translator && b.translator + ' 译', b.publisher].filter(Boolean).map((x) => hl(x, rawQ)).join('　');
    return `<button class="row" data-book="${b.id}"><span class="av" style="--c1:${b._p.c1};--ct:${b._p.ct}">${esc(first)}</span>
      <span class="bd"><div class="t">${hl(b.title, rawQ)}${tags}</div>${m ? `<div class="m">${m}</div>` : ''}</span>
      <span class="chev"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span></button>`;
  }
  const X = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  const ring = (frac, size = 40, stroke = 5, color = 'var(--accent)', track = 'var(--track)') => {
    const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c * frac} ${c}"/></svg>`;
  };

  // ---------- chrome ----------
  function renderChrome() {
    const nav = TABS.map(([k, l]) => {
      const badge = k === 'wanted' ? wantCount() : 0;
      return { k, l, badge };
    });
    $('#tabbar').innerHTML = nav.map(({ k, l, badge }) => `<button class="tab${state.tab === k ? ' on' : ''}" data-tab="${k}" aria-label="${l}"${state.tab === k ? ' aria-current="page"' : ''}>${ICONS[k]}<span>${l}</span>${badge ? `<i class="badge">${badge}</i>` : ''}</button>`).join('');
    $('#sideNav').innerHTML = nav.map(({ k, l, badge }) => `<button class="${state.tab === k ? 'on' : ''}" data-tab="${k}"${state.tab === k ? ' aria-current="page"' : ''}><span class="ic">${ICONS[k]}</span>${l}${badge ? `<span style="margin-left:auto;font-size:12px;opacity:.7">${badge}</span>` : ''}</button>`).join('');
    const owned = state.books.filter((b) => b.status === 'owned').length;
    const H = {
      home: `<h1 class="hello">${greeting()}<br>今天读哪一本？</h1><p class="sub">家里一共 <b class="num">${owned}</b> 本书，<b class="num">${seriesInfo().length}</b> 套书</p>`,
      books: `<h1 class="page-title">书目</h1>`,
      series: `<h1 class="page-title">套书</h1><p class="sub">每套已有几册，还缺哪几册</p>`,
      wanted: `<h1 class="page-title">想买</h1>`,
    };
    $('#headText').innerHTML = H[state.tab];
    const n = activeFilters(); $('#filterBtn').classList.toggle('on', n > 0); $('#filterDot').textContent = n;
    $('#filterBtn').hidden = state.tab !== 'books' && state.tab !== 'home';
  }
  function greeting() { const h = new Date().getHours(); return h < 5 ? '夜深了，' : h < 11 ? '早上好，' : h < 14 ? '中午好，' : h < 18 ? '下午好，' : '晚上好，'; }
  function wantCount() { return state.books.filter((b) => b.status === 'wanted').length + seriesInfo().reduce((n, s) => n + s.missing.filter((v) => !s.want.has(v)).length, 0); }

  // ---------- home ----------
  function renderHome() {
    const owned = state.books.filter((b) => b.status === 'owned');
    const S = seriesInfo(); const withTotal = S.filter((s) => s.total); const complete = withTotal.filter((s) => !s.missing.length);
    const gapN = S.reduce((n, s) => n + s.missing.length, 0);
    const counts = countBy(owned, (b) => b.category || '未分类');
    const cats = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    if (!state.barCat || !counts.has(state.barCat)) state.barCat = cats[0];
    const max = counts.get(cats[0]) || 1;
    const cur = state.barCat; const curN = counts.get(cur) || 0;
    const incomplete = S.filter((s) => s.total && s.missing.length).sort((a, b) => b.have.size / b.total - a.have.size / a.total).slice(0, 4);
    const recent = state.books.slice().sort((a, b) => cmp(b.id, a.id)).slice(0, 12);
    const lowN = state.books.filter((b) => b.confidence === 'low').length;

    $('#main').innerHTML = `<div class="home">
      <div class="tiles span-6">
        <button class="tile dark" data-go="books"><span class="ic">${ICONS.books}</span><span><span class="lab">藏书</span><span class="val num">${owned.length}<small>本</small></span></span></button>
        <button class="tile" data-go="series"><span class="ic">${ring(withTotal.length ? complete.length / withTotal.length : 0, 36, 5)}</span><span><span class="lab">套书已齐</span><span class="val num">${complete.length}<small>/ ${withTotal.length}</small></span></span></button>
        <button class="tile accent" data-go="wanted"><span class="ic">${ICONS.wanted}</span><span><span class="lab">套书还缺</span><span class="val num">${gapN}<small>册</small></span></span></button>
      </div>

      <section class="card span-4 category-chart">
        <div class="chart-top">
          <div><div class="big num">${curN}<small>本</small></div><div class="cap">${esc(cur)}，占藏书 ${Math.round(curN / owned.length * 100)}%</div></div>
          <button class="go" data-cat-go="${esc(cur)}">看这 ${curN} 本</button>
        </div>
        <div class="bars" role="group" aria-label="各分类本数">${cats.map((c) => `<button class="${c === cur ? 'on' : ''}" data-bar="${esc(c)}" aria-label="${esc(c)} ${counts.get(c)} 本"><i style="height:${Math.max(6, counts.get(c) / max * 100)}%"></i></button>`).join('')}</div>
        <div class="bar-axis">${cats.map((c) => `<span>${esc(c.slice(0, 1))}</span>`).join('')}</div>
      </section>

      <section class="card span-2">
        <div class="card-h"><h3>套书进度</h3><button class="link" data-go="series">全部</button></div>
        <div class="prog">${incomplete.map((s) => `<button class="prog-row" data-series="${esc(s.name)}"><div class="top"><b>${esc(s.name)}</b><span class="num">${s.have.size}/${s.total}</span></div><div class="mini">${Array.from({ length: s.total }, (_, k) => { const b = s.have.get(k + 1); return b ? `<i style="height:${62 + hash(b.id) % 38}%;background:${b._s.c}"></i>` : '<i class="miss"></i>'; }).join('')}</div><div class="miss">缺第 ${s.missing.join('、')} 册</div></button>`).join('') || '<p class="sub">所有套书都齐了</p>'}</div>
      </section>

      <section class="card span-6">
        <div class="card-h"><h3>按分类找</h3><button class="link" data-go="books">全部书目</button></div>
        <div class="cats">${cats.map((c) => `<button class="cat" data-cat-go="${esc(c)}" style="--c:${CAT[c] || CAT['其他']}"><span class="o">${esc(c.slice(0, 1))}</span>${esc(c.length > 4 ? c.slice(0, 4) : c)}</button>`).join('')}</div>
      </section>

      <section class="card span-6">
        <div class="card-h"><h3>最近录入</h3><button class="link" data-recent>全部</button></div>
        <div class="strip">${recent.map((b) => cover(b)).join('')}</div>
      </section>

      <section class="card tipcard span-6">
        <span class="bolt"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg></span>
        <div><b>${lowN ? `有 ${lowN} 本书待核对` : '拍书架，自动录入'}</b><span>${lowN ? '书脊没看清的书，拍个封面发给 Claude 就能确认' : '把书架照片发给 Claude，新书会自动加进来'}</span></div>
      </section>
    </div>`;
    hideRail();
  }

  // ---------- books ----------
  function renderBooks() {
    const rawQ = state.q; const q = norm(rawQ); let html = ''; let list; let groups;
    if (q) {
      list = state.books.filter((b) => matches(b, q)).sort(SORTS.py.fn);
      const own = list.filter((b) => b.status === 'owned').length; const want = list.length - own;
      html += own ? `<div class="card answer yes fade"><span class="ic"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span><div><b>家里有</b><span>找到 ${own} 本相关的书${want ? `，另有 ${want} 本在想买清单` : ''}</span></div></div>`
        : want ? `<div class="card answer maybe fade"><span class="ic"><svg viewBox="0 0 24 24"><path d="M6 6h15l-1.5 9h-12zM6 6 5 3H2"/></svg></span><div><b>还没买，已在想买清单</b><span>${want} 本</span></div></div>`
        : `<div class="card answer no fade"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><div><b>家里没有这本</b><span>书目里没有匹配结果。也可以试试搜作者或拼音首字母</span></div></div>`;
      groups = list.length ? [['搜索结果', list]] : [];
    } else {
      const base = filtered({ ignoreCats: true }); const counts = countBy(base, (b) => b.category || '未分类');
      const cats = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
      html += `<div class="chips">${[`<button class="chip${state.cats.size ? '' : ' on'}" data-cat="">全部<span class="n num">${base.length}</span></button>`, ...cats.map((c) => `<button class="chip${state.cats.has(c) ? ' on' : ''}" data-cat="${esc(c)}"><i style="background:${CAT[c] || CAT['其他']}"></i>${esc(c)}<span class="n num">${counts.get(c)}</span></button>`)].join('')}</div>`;
      list = filtered().sort(SORTS[state.sort].fn);
      const g = new Map(); list.forEach((b) => { const k = SORTS[state.sort].group(b); if (!g.has(k)) g.set(k, []); g.get(k).push(b); });
      groups = [...g.entries()];
      if (state.sort === 'pub') groups.sort((a, b) => b[1].length - a[1].length);
      if (SORTS[state.sort].rail) groups.sort((a, b) => (a[0] === '#') - (b[0] === '#') || cmp(a[0], b[0]));
      html += `<div class="tools"><span class="count"><b class="num">${list.length}</b> 本</span><span class="seg sortseg" role="group" aria-label="排序">${Object.entries(SORTS).map(([k, s]) => `<button class="${state.sort === k ? 'on' : ''}" aria-pressed="${state.sort === k}" data-sort="${k}">${s.label}</button>`).join('')}</span>
        <span class="seg" role="group" aria-label="显示方式"><button class="${state.view === 'shelf' ? 'on' : ''}" aria-pressed="${state.view === 'shelf'}" data-view="shelf" aria-label="书脊"><svg viewBox="0 0 24 24"><path d="M5 4h3v16H5zM10 4h3v16h-3zM15.5 5.2l2.9-.8 3.6 15.4-2.9.8z"/></svg></button><button class="${state.view === 'list' ? 'on' : ''}" aria-pressed="${state.view === 'list'}" data-view="list" aria-label="列表"><svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg></button><button class="${state.view === 'grid' ? 'on' : ''}" aria-pressed="${state.view === 'grid'}" data-view="grid" aria-label="封面"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg></button></span></div>`;
      const pills = [];
      if (state.status !== 'owned') pills.push(`<button class="pill" data-unset="status">${{ all: '全部状态', wanted: '想买', low: '待核对' }[state.status]}${X}</button>`);
      if (state.cats.size > 1) state.cats.forEach((c) => pills.push(`<button class="pill" data-unset-cat="${esc(c)}">${esc(c)}${X}</button>`));
      state.pubs.forEach((p) => pills.push(`<button class="pill" data-unset-pub="${esc(p)}">${esc(p)}${X}</button>`));
      if (state.seriesOnly) pills.push(`<button class="pill" data-unset="series">只看套书${X}</button>`);
      if (pills.length) html += `<div class="pills">${pills.join('')}<button class="pill reset" data-unset="all">全部清除</button></div>`;
      if (!list.length) html += '<div class="empty"><b>没有符合条件的书</b><button data-unset="all" style="color:var(--accent)">清除筛选</button></div>';
    }
    const view = q ? 'list' : state.view; let i = 0;
    html += groups.map(([k, bs]) => `<section id="g-${esc(k)}"><h2 class="group-h">${esc(k)}<span class="n num">${bs.length}</span></h2>
      ${view === 'grid' ? `<div class="grid">${bs.map((b) => cover(b)).join('')}</div>`
        : view === 'shelf' ? `<div class="shelf${state.firstShelf ? ' reveal' : ''}">${bs.map((b) => spine(b, i++)).join('')}</div>`
        : `<div class="list">${bs.map((b) => row(b, rawQ)).join('')}</div>`}</section>`).join('');
    $('#main').innerHTML = html;
    if (view === 'shelf') state.firstShelf = false;
    const useRail = !q && SORTS[state.sort].rail && groups.length > 5;
    $('#rail').hidden = !useRail; document.body.classList.toggle('has-rail', useRail);
    if (useRail) $('#rail').innerHTML = groups.map(([k]) => `<span data-g="${esc(k)}">${esc(k)}</span>`).join('');
  }
  const hideRail = () => { $('#rail').hidden = true; document.body.classList.remove('has-rail'); };

  // ---------- series ----------
  function seriesCard(s) {
    const n = s.total ? s.have.size : s.owned.length; const done = s.total && !s.missing.length;
    let dots = '';
    if (s.total) for (let v = 1; v <= s.total; v++) dots += `<i class="${s.have.has(v) ? 'have' : s.want.has(v) ? 'want' : 'miss'}">${v}</i>`;
    else dots = s.owned.map((b, i) => `<i class="have">${b.volume || i + 1}</i>`).join('');
    const frac = s.total ? n / s.total : 1;
    return `<button class="card set" data-series="${esc(s.name)}">
      <div class="set-h"><div><div class="t">${esc(s.name)}</div><div class="a">${esc([s.author, s.publisher].filter(Boolean).join('　'))}</div></div>
      <div class="pct">${ring(frac, 52, 6, done ? 'var(--ok)' : 'var(--accent)')}<span class="num">${s.total ? `${n}/${s.total}` : n}</span></div></div>
      <div class="dots">${dots}</div>
      ${s.missing.length ? `<div class="note">缺第 ${s.missing.join('、')} 册</div>` : done ? '<div class="note ok">全套齐了</div>' : '<div class="note muted">不知道一共几册，告诉 Claude 就能算出缺哪本</div>'}
    </button>`;
  }
  function renderSeries() {
    const q = norm(state.q);
    const all = seriesInfo().filter((s) => !q || norm(s.name + s.author).includes(q) || (/^[a-z0-9]+$/.test(q) && (s._py.includes(q) || s._first.includes(q))));
    const G = { all, miss: all.filter((s) => s.missing.length), done: all.filter((s) => s.total && !s.missing.length), unk: all.filter((s) => !s.total) };
    const L = { all: '全部', miss: '缺册', done: '已齐', unk: '册数未知' };
    $('#main').innerHTML = `<span class="seg series-filters" role="group" aria-label="套书状态">${Object.keys(L).map((k) => `<button class="${state.seriesFilter === k ? 'on' : ''}" aria-pressed="${state.seriesFilter === k}" data-sf="${k}">${L[k]} ${G[k].length}</button>`).join('')}</span>
      ${G[state.seriesFilter].length ? `<div class="series-grid">${G[state.seriesFilter].map(seriesCard).join('')}</div>` : '<div class="empty"><b>没有找到套书</b>换个关键词试试</div>'}`;
    hideRail();
  }

  // ---------- wanted ----------
  function renderWanted() {
    const q = norm(state.q);
    const wanted = state.books.filter((b) => b.status === 'wanted' && matches(b, q)).sort(SORTS.py.fn);
    const gaps = seriesInfo().map((s) => ({ s, vols: s.missing.filter((v) => !s.want.has(v)) })).filter((x) => x.vols.length && (!q || norm(x.s.name).includes(q)));
    const gapN = gaps.reduce((n, x) => n + x.vols.length, 0);
    $('#main').innerHTML = `<div class="tiles" style="grid-template-columns:1fr 1fr;margin-top:4px">
        <div class="tile dark"><span class="ic">${ICONS.wanted}</span><span><span class="lab">想买清单</span><span class="val num">${wanted.length}<small>本</small></span></span></div>
        <div class="tile accent"><span class="ic">${ICONS.series}</span><span><span class="lab">套书缺口</span><span class="val num">${gapN}<small>册</small></span></span></div></div>
      <h2 class="group-h">想买的书<span class="n">${wanted.length}</span></h2>
      ${wanted.length ? `<div class="list">${wanted.map((b) => row(b, state.q)).join('')}</div>` : '<div class="card empty"><b>清单是空的</b>看到想买的书，告诉 Claude 加进来</div>'}
      ${gaps.length ? `<h2 class="group-h">套书缺口<span class="n">${gapN} 册</span></h2><div class="series-grid" style="margin-top:0">${gaps.map(({ s }) => seriesCard(s)).join('')}</div>` : ''}`;
    hideRail();
  }

  function render() {
    renderChrome();
    ({ home: renderHome, books: renderBooks, series: renderSeries, wanted: renderWanted })[state.tab]();
  }
  function go(tab) { if (tab === 'books') state.firstShelf = true; state.tab = tab; store.set('tab', tab); window.scrollTo({ top: 0 }); render(); }

  // ---------- sheet ----------
  const sheet = $('#sheet'); const scrim = $('#scrim'); const body = $('#sheetBody'); let kind = null;
  const sheetClose = $('#sheetClose');
  const shell = $('.shell'), tabbar = $('#tabbar'), rail = $('#rail');
  const focus = (el) => el?.focus({ preventScroll: true });
  let opener;
  function labelSheet() {
    const title = body.querySelector('h2');
    title.id = 'sheetTitle';
    title.tabIndex = -1;
    return title;
  }
  function renderSheetContent(html) {
    sheet.querySelector('.sheet-foot')?.remove();
    body.innerHTML = html;
    const foot = body.querySelector('.sheet-foot');
    if (foot) sheet.append(foot);
    return labelSheet();
  }
  function openSheet(html, k, trigger) {
    if (!kind) opener = trigger || document.activeElement;
    const title = renderSheetContent(html);
    body.scrollTop = 0;
    kind = k;
    sheet.inert = false;
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('show');
    scrim.classList.add('show');
    focus(title);
    shell.inert = tabbar.inert = rail.inert = true;
    document.documentElement.classList.add('sheet-open');
    $('#filterBtn').setAttribute('aria-expanded', String(k === 'filter'));
  }
  function closeSheet() {
    if (!kind) return;
    kind = null;
    shell.inert = tabbar.inert = rail.inert = false;
    document.documentElement.classList.remove('sheet-open');
    focus(opener?.isConnected && opener !== document.body ? opener : $('#q'));
    sheet.inert = true;
    sheet.setAttribute('aria-hidden', 'true');
    sheet.classList.remove('show', 'dragging');
    scrim.classList.remove('show');
    sheet.style.transform = '';
    $('#filterBtn').setAttribute('aria-expanded', 'false');
  }
  scrim.addEventListener('click', closeSheet);
  sheetClose.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (!kind) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    if (e.key !== 'Tab') return;
    const controls = Array.from(sheet.querySelectorAll('button, a[href]'));
    const at = controls.indexOf(document.activeElement);
    if (at < 0 || (e.shiftKey ? at === 0 : at === controls.length - 1)) {
      e.preventDefault();
      focus(controls[e.shiftKey ? controls.length - 1 : 0]);
      document.activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });
  (() => {
    const grab = $('.grab');
    let pointer, y0, dy;
    grab.addEventListener('pointerdown', (e) => {
      if (!kind || matchMedia('(min-width: 960px)').matches || !e.isPrimary || e.button !== 0) return;
      pointer = e.pointerId; y0 = e.clientY; dy = 0;
      grab.setPointerCapture(pointer);
      sheet.classList.add('dragging');
    });
    grab.addEventListener('pointermove', (e) => {
      if (!kind || e.pointerId !== pointer) return;
      dy = Math.max(0, e.clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    function finish(e) {
      if (e.pointerId !== pointer) return;
      pointer = undefined;
      sheet.classList.remove('dragging');
      if (e.type === 'pointerup' && dy > 100) closeSheet();
      sheet.style.transform = '';
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => grab.addEventListener(type, finish));
  })();

  function filterHtml() {
    const sc = { owned: 0, wanted: 0, low: 0, all: state.books.length };
    state.books.forEach((b) => { sc[b.status] = (sc[b.status] || 0) + 1; if (b.confidence === 'low') sc.low++; });
    const cc = countBy(filtered({ ignoreCats: true }), (b) => b.category || '未分类'); const cats = [...cc.keys()].sort((a, b) => cc.get(b) - cc.get(a));
    const pc = countBy(filtered({ ignorePubs: true }), (b) => b.publisher || '未记录');
    let pubs = [...pc.keys()].sort((a, b) => (a === '未记录') - (b === '未记录') || pc.get(b) - pc.get(a));
    const more = pubs.length > 10 && !state.pubMore; if (more) pubs = [...new Set([...pubs.slice(0, 10), ...state.pubs])];
    return `<h2>筛选和排序</h2>
      <div class="fs"><h3>排序</h3><div class="opts">${Object.entries(SORTS).map(([k, s]) => `<button class="opt${state.sort === k ? ' on' : ''}" aria-pressed="${state.sort === k}" data-sort="${k}">${s.label}</button>`).join('')}</div></div>
      <div class="fs"><h3>状态</h3><div class="opts">${[['owned', '已有'], ['wanted', '想买'], ['low', '待核对'], ['all', '全部']].map(([k, l]) => `<button class="opt${state.status === k ? ' on' : ''}" aria-pressed="${state.status === k}" data-status="${k}">${l}<span class="n num">${sc[k] || 0}</span></button>`).join('')}</div></div>
      <div class="fs"><h3>分类（可多选）</h3><div class="opts">${cats.map((c) => `<button class="opt${state.cats.has(c) ? ' on' : ''}" aria-pressed="${state.cats.has(c)}" data-fcat="${esc(c)}"><i style="background:${CAT[c] || CAT['其他']}"></i>${esc(c)}<span class="n num">${cc.get(c)}</span></button>`).join('')}</div></div>
      <div class="fs"><h3>出版社</h3><div class="opts">${pubs.map((p) => `<button class="opt${state.pubs.has(p) ? ' on' : ''}" aria-pressed="${state.pubs.has(p)}" data-pub="${esc(p)}">${esc(p)}<span class="n num">${pc.get(p) || 0}</span></button>`).join('')}${more ? `<button class="opt more" data-act="more">还有 ${pc.size - 10} 家</button>` : ''}</div></div>
      <div class="fs switch-row"><span>只看套书里的书</span><button class="switch${state.seriesOnly ? ' on' : ''}" data-act="series" role="switch" aria-checked="${state.seriesOnly}" aria-label="只看套书"></button></div>
      <div class="sheet-foot"><button class="btn sec" data-act="reset">重置</button><button class="btn pri" data-act="close">显示 ${filtered().length} 本</button></div>`;
  }
  const resetFilters = () => { state.status = 'owned'; state.cats.clear(); state.pubs.clear(); state.seriesOnly = false; };

  function openBook(id, trigger) {
    const b = state.byId.get(id); if (!b) return;
    const s = b.series ? seriesInfo().find((x) => x.name === b.series) : null;
    const same = b.author ? state.books.filter((x) => x.id !== b.id && x.author === b.author && (!s || x.series !== s.name)).slice(0, 20) : [];
    const facts = [
      ['作者', b.author && `<a href="#" data-author-link="${esc(b.author)}">${esc(b.author)}</a>`], ['译者', b.translator && esc(b.translator)],
      ['出版社', b.publisher && esc(b.publisher), true], ['套书', s && `<a href="#" data-series-link="${esc(s.name)}">${esc(s.name)}</a>${b.volume ? `　第 ${b.volume} 册` : ''}${s.total ? `，共 ${s.total} 册` : ''}`, true],
      ['备注', b.notes && esc(b.notes), true], ['录入日期', b.addedAt && esc(b.addedAt)], ['分类', esc(b.category || '未分类')],
    ].filter(([, v]) => v);
    openSheet(`<div class="detail-top">${cover(b, { caption: false })}<div><h2>${esc(b.title)}</h2><div class="by">${esc([b.author, b.translator && b.translator + ' 译'].filter(Boolean).join('　'))}</div>
        <div class="badges">${b.status === 'owned' ? '<span class="bd-pill ok">家里有</span>' : '<span class="bd-pill hot">想买</span>'}${b.confidence === 'low' ? '<span class="bd-pill hot">待核对</span>' : ''}</div></div></div>
      <div class="facts">${facts.map(([k, v, w]) => `<div class="fact${w ? ' wide' : ''}"><small>${k}</small><span>${v}</span></div>`).join('')}</div>
      ${s && s.members.length > 1 ? `<div class="rel"><h3>同一套</h3><div class="spine-strip">${s.members.map((x) => spine(x)).join('')}</div></div>` : ''}
      ${same.length ? `<div class="rel"><h3>${esc(b.author)}的其他书</h3><div class="strip">${same.map((x) => cover(x)).join('')}</div></div>` : ''}`, 'book', trigger);
  }
  function openSeries(name, trigger) {
    const s = seriesInfo().find((x) => x.name === name); if (!s) return;
    openSheet(`<h2>${esc(s.name)}</h2>${seriesCard(s).replace('<button class="card set"', '<div class="card set" style="box-shadow:none;background:var(--card-hi)"').replace(/<\/button>\s*$/, '</div>')}
      <div class="rel"><div class="spine-strip">${s.members.map((x) => spine(x)).join('')}</div></div><div class="rel"><h3>家里有的 ${s.owned.length} 册</h3><div class="list" style="padding:4px">${s.members.map((b) => row(b)).join('')}</div></div>`, 'series', trigger);
  }

  sheet.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-author-link],a[data-series-link]');
    if (a) { e.preventDefault(); if (a.dataset.seriesLink) openSeries(a.dataset.seriesLink); else { closeSheet(); state.tab = 'books'; setQuery(a.dataset.authorLink); if (e.detail === 0) focus(qEl); } return; }
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    if (d.book) return openBook(d.book);
    if (d.series) return openSeries(d.series);
    if (kind !== 'filter') return;
    if (d.sort) { state.sort = d.sort; store.set('sort', d.sort); }
    else if (d.status) state.status = d.status;
    else if (d.fcat) state.cats.has(d.fcat) ? state.cats.delete(d.fcat) : state.cats.add(d.fcat);
    else if (d.pub) state.pubs.has(d.pub) ? state.pubs.delete(d.pub) : state.pubs.add(d.pub);
    else if (d.act === 'series') state.seriesOnly = !state.seriesOnly;
    else if (d.act === 'more') state.pubMore = true;
    else if (d.act === 'reset') resetFilters();
    else if (d.act === 'close') { closeSheet(); if (state.tab !== 'books') go('books'); return; }
    else return;
    const st = body.scrollTop;
    renderSheetContent(filterHtml());
    body.scrollTop = st;
    if (state.tab === 'books') render(); else renderChrome();
    const [key, value] = Object.entries(d)[0];
    focus([...sheet.querySelectorAll('button')].find((b) => b.dataset[key] === value) || sheet.querySelector('[data-act="close"]'));
  });

  // ---------- events ----------
  const qEl = $('#q');
  let tmr;
  function setQuery(v) {
    clearTimeout(tmr);
    qEl.value = state.q = v;
    $('#searchBox').classList.toggle('has', !!v);
    if (v.trim() && state.tab === 'home') state.tab = 'books';
    render();
    window.scrollTo({ top: 0 });
  }
  function queueSearch(e) {
    $('#searchBox').classList.toggle('has', !!qEl.value);
    clearTimeout(tmr);
    if (!e.isComposing) tmr = setTimeout(() => setQuery(qEl.value), 110);
  }
  qEl.addEventListener('input', queueSearch);
  qEl.addEventListener('compositionstart', () => clearTimeout(tmr));
  qEl.addEventListener('compositionend', queueSearch);
  qEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { setQuery(qEl.value); qEl.blur(); }
  });
  $('#clear').addEventListener('click', () => { setQuery(''); qEl.focus(); });
  $('#filterBtn').addEventListener('click', (e) => openSheet(filterHtml(), 'filter', e.currentTarget));
  const onNav = (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === state.tab) return;
    const nav = b.parentElement;
    go(b.dataset.tab);
    if (e.detail === 0) focus(nav.querySelector('[aria-current="page"]'));
  };
  $('#tabbar').addEventListener('click', onNav); $('#sideNav').addEventListener('click', onNav);
  $('#skinBtn').addEventListener('click', () => { state.skin = state.skin === 'graphite' ? 'lavender' : 'graphite'; store.set('skin', state.skin); applySkin(); });
  function applySkin() { document.documentElement.setAttribute('data-skin', state.skin); document.querySelector('meta[name=theme-color]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg1').trim(); }

  $('#main').addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t || !Object.keys(t.dataset).length) return; const d = t.dataset;
    const chipScroll = $('.chips')?.scrollLeft;
    if (d.book) openBook(d.book, t);
    else if (d.series) openSeries(d.series, t);
    else if (d.go) go(d.go);
    else if (d.bar) { state.barCat = d.bar; renderHome(); }
    else if (d.catGo !== undefined) { state.cats = new Set([d.catGo]); state.status = 'owned'; go('books'); }
    else if (d.recent !== undefined) { state.sort = 'recent'; store.set('sort', 'recent'); go('books'); }
    else if (d.cat !== undefined) { const k = d.cat; if (!k || (state.cats.size === 1 && state.cats.has(k))) state.cats.clear(); else state.cats = new Set([k]); render(); }
    else if (d.sort) { state.sort = d.sort; store.set('sort', d.sort); render(); }
    else if (d.view) { state.view = d.view; store.set('view', d.view); state.firstShelf = d.view === 'shelf'; render(); }
    else if (d.sf) { state.seriesFilter = d.sf; render(); }
    else if (d.unset) { if (d.unset === 'all') resetFilters(); else if (d.unset === 'status') state.status = 'owned'; else state.seriesOnly = false; render(); }
    else if (d.unsetCat) { state.cats.delete(d.unsetCat); render(); }
    else if (d.unsetPub) { state.pubs.delete(d.unsetPub); render(); }
    if (t.isConnected) return;
    if (d.cat !== undefined && $('.chips')) $('.chips').scrollLeft = chipScroll;
    if (e.detail === 0) {
      const [key, value] = Object.entries(d)[0];
      const next = [...$('#main').querySelectorAll('button')].find((b) => b.dataset[key] === value);
      focus(next || $('#q'));
    }
  });
  new IntersectionObserver(([en]) => $('#searchbar').classList.toggle('stuck', !en.isIntersecting), { threshold: 0 }).observe($('.head'));
  (() => {
    const rail = $('#rail'); const bub = $('#bubble'); let on = false; let last = '';
    const hit = (y) => { const el = document.elementFromPoint(rail.getBoundingClientRect().left + 8, y); const g = el?.dataset?.g; if (!g || g === last) return; last = g; bub.textContent = g; bub.classList.add('show'); const sec = document.getElementById('g-' + g); if (sec) scrollTo({ top: sec.getBoundingClientRect().top + scrollY - $('#searchbar').offsetHeight - 12 }); };
    rail.addEventListener('pointerdown', (e) => { on = true; last = ''; rail.setPointerCapture(e.pointerId); hit(e.clientY); });
    rail.addEventListener('pointermove', (e) => on && hit(e.clientY));
    const end = () => { on = false; bub.classList.remove('show'); };
    rail.addEventListener('pointerup', end); rail.addEventListener('pointercancel', end);
  })();

  applySkin();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  (async () => {
    const [books, series] = await Promise.all([fetch('data/books.json').then((r) => r.json()), fetch('data/series.json').then((r) => r.json()).catch(() => [])]);
    state.books = books; state.series = series; books.forEach((b) => { indexBook(b); state.byId.set(b.id, b); }); render();
  })().catch((err) => { $('#main').innerHTML = `<div class="empty"><b>书目没加载出来</b>${esc(err.message)}。检查网络后刷新页面。</div>`; });
})();
