#!/usr/bin/env node
// Checks data/books.json and data/series.json. Usage: node scripts/validate.mjs [booksPath] [seriesPath]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = process.argv[2] || join(root, 'data/books.json');
const seriesPath = process.argv[3] || join(root, 'data/series.json');

const errors = [];
const warnings = [];
const books = JSON.parse(readFileSync(booksPath, 'utf8'));
const series = JSON.parse(readFileSync(seriesPath, 'utf8'));

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKC')
  .replace(/[\s·•・\-—_.,，。:：《》<>()（）'"“”‘’!！?？]/g, '');

const STATUS = new Set(['owned', 'wanted']);
const CONF = new Set(['high', 'low']);
const ids = new Map();
const keys = new Map();

books.forEach((b, i) => {
  const where = `#${i} ${b.id ?? '?'} 《${b.title ?? '?'}》`;
  if (!b.id) errors.push(`${where}: 缺少 id`);
  else if (ids.has(b.id)) errors.push(`${where}: id 与 ${ids.get(b.id)} 重复`);
  else ids.set(b.id, where);
  if (!b.title) errors.push(`${where}: 缺少书名`);
  if (!STATUS.has(b.status)) errors.push(`${where}: status 必须是 owned 或 wanted`);
  if (b.confidence && !CONF.has(b.confidence)) errors.push(`${where}: confidence 必须是 high 或 low`);
  if (!b.category) warnings.push(`${where}: 没有分类`);
  if (b.volume != null && !(Number.isInteger(b.volume) && b.volume > 0)) errors.push(`${where}: volume 必须是正整数`);
  if (b.volume != null && !b.series) errors.push(`${where}: 有 volume 但没有 series`);

  // Same title + author + volume twice is almost always a duplicate entry.
  const k = `${norm(b.title)}|${norm(b.author)}|${b.volume ?? ''}`;
  if (keys.has(k)) {
    const other = keys.get(k);
    const msg = `${where}: 与 ${other.where} 重复`;
    if (other.status === b.status) errors.push(msg);
    else warnings.push(`${msg}（一本已有一本想买，想买的那条可以删了）`);
  } else keys.set(k, { where, status: b.status });
});

const seriesNames = new Set();
series.forEach((s, i) => {
  if (!s.name) errors.push(`series #${i}: 缺少 name`);
  if (seriesNames.has(s.name)) errors.push(`series「${s.name}」重复定义`);
  seriesNames.add(s.name);
  if (s.total != null && !(Number.isInteger(s.total) && s.total > 0)) errors.push(`series「${s.name}」: total 必须是正整数`);
  books.filter((b) => b.series === s.name && b.volume > s.total)
    .forEach((b) => errors.push(`《${b.title}》第${b.volume}册超出「${s.name}」总册数 ${s.total}`));
});
[...new Set(books.map((b) => b.series).filter(Boolean))]
  .filter((n) => !seriesNames.has(n))
  .forEach((n) => warnings.push(`套书「${n}」没有在 series.json 里登记总册数`));

const owned = books.filter((b) => b.status === 'owned').length;
const low = books.filter((b) => b.confidence === 'low').length;
console.log(`共 ${books.length} 条：已有 ${owned}，想买 ${books.length - owned}，待核对 ${low}，套书 ${series.length}`);
warnings.forEach((w) => console.log('⚠ ' + w));
errors.forEach((e) => console.log('✗ ' + e));
if (errors.length) { console.log(`\n${errors.length} 个错误`); process.exit(1); }
console.log('✓ 通过');
