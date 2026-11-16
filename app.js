(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const state = { books: [], series: [], tab: 'books', cat: '全部', q: '' };

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s·•・\-—_.,，。:：《》<>()（）'"“”‘’!！?？]/g, '');

  const py = window.pinyinPro;
  function pinyinKeys(text) {
    if (!py || !text) return { full: '', first: '' };
    const full = py.pinyin(text, { toneType: 'none', type: 'array', v: true }).join('');
    const first = py.pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' }).join('');
    return { full: norm(full), first: norm(first) };
  }

  function indexBook(b) {
    const fields = [b.title, b.author, b.translator, b.publisher, b.series].filter(Boolean);
    const plain = norm(fields.join('|'));
    const pys = fields.map(pinyinKeys);
    b._idx = { plain, full: pys.map((p) => p.full).join('|'), first: pys.map((p) => p.first).join('|') };
    // Books in a series sort together, by volume number.
    b._sort = b.series && b.volume
      ? (pinyinKeys(b.series).full || norm(b.series)) + '#' + String(b.volume).padStart(4, '0')
      : (pinyinKeys(b.title).full || norm(b.title));
  }

  function matches(b, q) {
    if (!q) return true;
    const i = b._idx;
    return i.plain.includes(q) || (/^[a-z0-9]+$/.test(q) && (i.full.includes(q) || i.first.includes(q)));
  }

  function hl(text, rawQ) {
    const t = esc(text);
    const q = rawQ.trim();
    if (!q) return t;
    const at = String(text).toLowerCase().indexOf(q.toLowerCase());
    if (at < 0) return t;
    const s = String(text);
    return esc(s.slice(0, at)) + '<mark>' + esc(s.slice(at, at + q.length)) + '</mark>' + esc(s.slice(at + q.length));
  }

  const volLabel = (v) => `第${v}册`;
  const byTitle = (a, b) => (a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : (a.volume || 0) - (b.volume || 0));

  function meta(b) {
    const parts = [];
    if (b.author) parts.push(b.author);
    if (b.translator) parts.push(b.translator + ' 译');
    if (b.publisher) parts.push(b.publisher);
    return parts.join(' · ');
  }

  function bookRow(b, rawQ = '') {
    const badges = [
      b.series && b.volume ? `<span class="badge vol">${esc(b.series)} ${b.volume}</span>` : '',
      b.status === 'wanted' ? '<span class="badge wanted">想买</span>' : '',
      b.confidence === 'low' ? '<span class="badge low" title="书脊识别不确定，待核对">待核对</span>' : '',
    ].join('');
    const m = meta(b);
    return `<div class="book">
      <div class="t">${hl(b.title, rawQ)}${badges}</div>
      ${m ? `<div class="m">${hl(m, rawQ)}</div>` : ''}
      ${b.notes ? `<div class="note">${esc(b.notes)}</div>` : ''}
    </div>`;
  }

  // ---------- series computation ----------
  function seriesInfo() {
    const defs = new Map(state.series.map((s) => [s.name, s]));
    const names = new Set([...defs.keys()]);
    state.books.forEach((b) => b.series && names.add(b.series));
    return [...names].map((name) => {
      const def = defs.get(name) || {};
      const members = state.books.filter((b) => b.series === name);
      const have = new Set(members.filter((b) => b.status === 'owned' && b.volume).map((b) => b.volume));
      const want = new Set(members.filter((b) => b.status === 'wanted' && b.volume).map((b) => b.volume));
      const total = def.total || null;
      const missing = [];
      if (total) for (let v = 1; v <= total; v++) if (!have.has(v)) missing.push(v);
      const owned = members.filter((b) => b.status === 'owned');
      return { name, total, author: def.author || members[0]?.author || '', have, want, missing, def, owned };
    }).sort((a, b) => (b.missing.length > 0) - (a.missing.length > 0) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  // ---------- renderers ----------
  function renderStats() {
    const owned = state.books.filter((b) => b.status === 'owned').length;
    const wanted = state.books.filter((b) => b.status === 'wanted').length;
    $('#stats').textContent = `藏书 ${owned} 本` + (wanted ? ` · 想买 ${wanted}` : '');
  }

  function renderBooks() {
    const q = norm(state.q);
    const searching = q.length > 0;
    const owned = state.books.filter((b) => b.status === 'owned');

    // category chips (based on owned books)
    const counts = new Map();
    owned.forEach((b) => counts.set(b.category || '未分类', (counts.get(b.category || '未分类') || 0) + 1));
    const cats = ['全部', ...[...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a))];
    if (!cats.includes(state.cat)) state.cat = '全部';
    $('#chips').hidden = searching;
    $('#chips').innerHTML = cats.map((c) => `<button class="chip${c === state.cat ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}<span class="n">${c === '全部' ? owned.length : counts.get(c)}</span></button>`).join('');

    // search hint: "家里已有？"
    const hint = $('#hint');
    let list;
    if (searching) {
      list = state.books.filter((b) => matches(b, q));
      const ownedHits = list.filter((b) => b.status === 'owned').length;
      const wantedHits = list.length - ownedHits;
      hint.hidden = false;
      hint.className = 'hint ' + (ownedHits ? 'have' : 'none');
      hint.textContent = ownedHits ? `家里已有 ${ownedHits} 本相关的书，买之前看一眼`
        : wantedHits ? '家里还没有，已经在想买清单里了' : '家里没有找到这本书';
    } else {
      hint.hidden = true;
      list = owned.filter((b) => state.cat === '全部' || (b.category || '未分类') === state.cat);
    }

    if (!list.length) {
      $('#bookList').innerHTML = searching ? '' : '<div class="empty">还没有书。把书架照片发给 Claude 就能开始录入。</div>';
      return;
    }

    // group by category (or flat when searching)
    const groups = new Map();
    list.slice().sort(byTitle).forEach((b) => {
      const k = searching ? '搜索结果' : (b.category || '未分类');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(b);
    });
    const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
    $('#bookList').innerHTML = order.map((k) => `
      <div class="group-title"><span>${esc(k)}</span><span>${groups.get(k).length}</span></div>
      <div class="card">${groups.get(k).map((b) => bookRow(b, state.q)).join('')}</div>`).join('');
  }

  function renderSeries() {
    const q = norm(state.q);
    const all = seriesInfo().filter((s) => !q || norm(s.name + s.author).includes(q)
      || (/^[a-z0-9]+$/.test(q) && (pinyinKeys(s.name).full.includes(q) || pinyinKeys(s.name).first.includes(q))));
    if (!all.length) {
      $('#seriesList').innerHTML = '<div class="empty">还没有套书记录。</div>';
      return;
    }
    $('#seriesList').innerHTML = all.map((s) => {
      let haveN = s.have.size;
      let vols = '';
      if (s.total) {
        for (let v = 1; v <= s.total; v++) {
          const cls = s.have.has(v) ? 'have' : s.want.has(v) ? 'want' : 'miss';
          vols += `<span class="vol ${cls}" title="${volLabel(v)}">${v}</span>`;
        }
      } else if (s.have.size) {
        vols = [...s.have].sort((a, b) => a - b).map((v) => `<span class="vol have">${v}</span>`).join('');
      }
      const unnumbered = !s.total && !s.have.size;
      if (unnumbered) haveN = s.owned.length;
      const done = s.total && !s.missing.length;
      return `<div class="card series">
        <div class="series-head">
          <span class="t">${esc(s.name)}</span>
          <span class="count${done ? ' done' : ''}">${s.total ? `${haveN}/${s.total}${done ? ' 齐了' : ''}` : `已有 ${haveN}`}</span>
        </div>
        ${s.author ? `<div class="m">${esc(s.author)}${s.def.publisher ? ' · ' + esc(s.def.publisher) : ''}</div>` : ''}
        ${vols ? `<div class="vols">${vols}</div>` : ''}
        ${unnumbered ? `<div class="m" style="margin-top:8px">${s.owned.map((b) => esc(b.title)).join('、')}</div>` : ''}
        ${s.missing.length ? `<div class="miss-text">缺：${s.missing.map(volLabel).join('、')}</div>` : ''}
        ${!s.total && !unnumbered ? '<div class="unknown">总册数未知，告诉 Claude 这套一共几册就能算出缺哪本</div>' : ''}
      </div>`;
    }).join('');
  }

  function renderWanted() {
    const q = norm(state.q);
    const wanted = state.books.filter((b) => b.status === 'wanted' && matches(b, q)).sort(byTitle);
    const gaps = seriesInfo()
      .flatMap((s) => s.missing.filter((v) => !s.want.has(v)).map((v) => ({ s, v })))
      .filter(({ s }) => !q || norm(s.name + s.author).includes(q));

    let html = '';
    html += `<div class="group-title"><span>想买的书</span><span>${wanted.length}</span></div>`;
    html += wanted.length ? `<div class="card">${wanted.map((b) => bookRow(b, state.q)).join('')}</div>`
      : '<div class="empty">清单是空的。想买什么告诉 Claude 加进来。</div>';
    if (gaps.length) {
      html += `<div class="group-title"><span>套书缺口</span><span>${gaps.length}</span></div>`;
      html += `<div class="card">${gaps.map(({ s, v }) => `<div class="book">
        <div class="t">${esc(s.name)}<span class="badge vol">${volLabel(v)}</span></div>
        ${s.author ? `<div class="m">${esc(s.author)}</div>` : ''}</div>`).join('')}</div>`;
    }
    $('#wantedList').innerHTML = html;
  }

  function render() {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== state.tab; });
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
    renderStats();
    if (state.tab === 'books') renderBooks();
    else if (state.tab === 'series') renderSeries();
    else renderWanted();
  }

  // ---------- events ----------
  let t;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value; render(); }, 120);
  });
  $('#chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    state.cat = c.dataset.cat;
    render();
  });
  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    state.tab = b.dataset.tab;
    try { sessionStorage.setItem('tab', state.tab); } catch {}
    window.scrollTo(0, 0);
    render();
  });

  // ---------- boot ----------
  async function load() {
    try { state.tab = sessionStorage.getItem('tab') || 'books'; } catch {}
    const [books, series] = await Promise.all([
      fetch('data/books.json').then((r) => r.json()),
      fetch('data/series.json').then((r) => r.json()).catch(() => []),
    ]);
    state.books = books;
    state.series = series;
    state.books.forEach(indexBook);
    render();
  }
  load().catch((err) => {
    $('#bookList').innerHTML = `<div class="empty">书目加载失败：${esc(err.message)}</div>`;
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
