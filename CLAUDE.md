# 家庭书目 HomeLibrary

A static PWA (no build step) the family opens on their phones to look up which books we own, which volumes of a series are missing, and what's on the shopping list. Claude maintains the data from bookshelf photos.

## Files
- `data/books.json`: the only catalog source. `data/series.json`: total volume counts, used to work out missing volumes.
- `index.html` / `app.js` / `style.css`: the page. `vendor/pinyin-pro.js` (v3.26.0, kept locally so search works offline): pinyin search.
- `sw.js`: offline cache. **When you change any app shell file, bump `VERSION`.** Data files are fetched network-first, so data-only changes don't need a bump.
- `scripts/validate.mjs`: data checks. `scripts/make_icons.py`: regenerates the icons.

## Book fields
| field | required | notes |
|---|---|---|
| id | ✓ | `b0001` and up, incrementing, never reused |
| title | ✓ | the title as printed on the spine, including the volume subtitle |
| author | | multiple authors separated by `、` |
| translator / publisher | | record if it's on the spine, otherwise look it up online or leave empty |
| category | | use existing categories when possible: 小说, 科幻, 历史, 儿童, 社科, 传记, 艺术, 生活, 教辅, 外文, 工具书… |
| series / volume | | for sets; `series` must match `name` in series.json exactly |
| status | ✓ | `owned` or `wanted` |
| confidence | | `low` = spine was blurry or recognition uncertain; shown in the app as "待核对" (to verify) |
| source | | the photo path in `photos/done/` |
| notes / addedAt | | addedAt as `YYYY-MM-DD` |

## Photo intake workflow
1. Photos are in `photos/inbox/` or were sent in the conversation (spine photos, usually one shelf row each).
2. Recognize each photo from left to right, one entry per book. When a spine is unclear, record the best guess with `confidence: "low"`, and list it to the user afterwards for confirmation or a cover photo.
3. Look up missing author/publisher info online as needed. When a book belongs to a set, add an entry to `series.json` (look up the total volume count).
4. Check for duplicates before adding: an existing entry with the same normalized title + author + volume means skip it. If the same book is on the wanted list, change it to `owned`.
5. Delete the sample entries on the first real batch (the first entry's notes say "示例数据", meaning sample data).
6. Run `node scripts/validate.mjs`; it must pass. Move the photos to `photos/done/` (prefix the filename with the date).
7. Report to the user: N books added, M to verify (list them), skipped duplicates, newly found set gaps.

## Publishing
- Live site: https://ringo1225.github.io/HomeLibrary/ (GitHub Pages, public repo Ringo1225/HomeLibrary, `main` branch root).
- To publish: run validate, then `git commit` + `git push`; Pages rebuilds in about 30 seconds.
- Photos are git-ignored and never uploaded; the `source` field in books.json is only a local path.

## Local preview
`python3 -m http.server 8765` (the service worker needs http, not file://).
