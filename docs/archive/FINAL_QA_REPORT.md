> **Arsip, digantikan.** Dokumen ini tidak lagi menjadi acuan; lihat `README.md`, `AGENTS.md`, dan `docs/TEST_REPORT.md` untuk keadaan terkini.

# Final QA Report — POSKOTANGGAP (audit of 2026-11-11)

**Read this first — what "verified" means here.** The audit sandbox had no network, so `npm install` could not run and the real `vitest`, `vite`, `@tailwindcss/vite` and `react-router-dom` were unavailable. Everything below that is labelled *substitute* was run with tools already on the machine (esbuild, Tailwind 4.3.3 compiler, Playwright/Chromium, a small stand-in test runner and a small stand-in router). Those results are real, but they are **not** the official `npm test` / `npm run build` / `npm run dev` / `npm run preview` commands. The team must run those four commands once on a networked machine (see SUBMISSION_CHECKLIST.md). No result in this report is fabricated; anything not run is stated as not run.

## 1. Critical bugs found and fixed
| # | Bug (found by new test in `tests/audit.test.ts` before fixing) | Fix |
|---|---|---|
| 1 | **Silent wrong quantity**: "2.500 kg beras" was extracted as **500 kg** (Indonesian thousands separator, regex matched the tail of the number). | Number must not be preceded by a digit/separator; `2.500` → 2500; decimals with comma still work. |
| 2 | A number belonging to something else was attached to an item: "40 pengungsi air mineral habis" → quantity 40. | A number followed by a non-unit word is left **unknown (null)**. |
| 3 | False location: "Di desa kami sedang banjir" extracted location "desa kami sedang" (regex was case-insensitive on the place name). | Place name must start with a capital letter. |
| 4 | **Multi-tab data loss**: two tabs on the same browser each held stale in-memory state; the second write overwrote the first tab's reports, and an exact duplicate submitted from another tab was not detected. | Every read/write now re-syncs from `localStorage` first (`LocalStorageRepository.sync`). Unreadable/empty storage keeps working memory state instead of silently re-seeding. |
| 5 | **Phantom saves**: when a `localStorage` write failed (quota/blocked) the error was shown but the unsaved report stayed visible on screen. | Failed writes roll the in-memory state back (`snapshot`/`restore`); error 507 "Tidak ada data yang berubah". |
| 6 | Editing the report text after extraction (or choosing another sample) kept the old extracted fields and evidence attached to the new text, so a wrong-text report could be verified. | Draft and extraction are discarded with a visible notice; operator must re-extract or enter manually. |

Also fixed (polish/safety): "Tolak laporan" now asks for confirmation; error messages use `role="alert"`; skip-to-content link and focusable `<main>`; favicon (no more 404/HTML-as-favicon request) and theme-color; area names display as "Simulasi Barat RW 03" (was "Rw 03"); `netlify.toml` pins `NODE_VERSION=22`; `package.json` `engines`; added `.gitignore` (none existed); removed committed `tsconfig.tsbuildinfo`; README rewritten for the Vite app (it still described Next.js/Supabase/Gemini); stale handoff notes replaced.

## 2. Features verified (evidence)
Checked in Chromium against the *substitute* build at 1280 px and 390 px — 64 checks, 0 failures, 0 console errors/warnings, 0 HTTP ≥400:
- Deep link `/dashboard` served via SPA fallback; unknown route redirects to `/intake`; navigation links work.
- Submit synthetic report → RuleBasedExtractor badge + per-field evidence quotes → edit fields (clear a quantity → stays unknown) → manual verify → appears on dashboard.
- Exact duplicate blocked (incl. the seeded report's text); potential duplicate blocks verify until the human-review checkbox is ticked; missing location blocks verify and fields stay empty.
- Stale-draft discard; reject requires confirmation (cancel keeps the report).
- Dashboard: status counts, shortage table (seed values match hand calculation: 30−12=18 short; beras sufficient; selimut 20−8=12; tenda no stock record; air mineral botol vs stock in dus = "Satuan berbeda", never converted), "not counted" breakdown, stock update recomputes shortage, negative stock rejected.
- Reload keeps data; reset asks confirmation, cancel keeps data, confirm restores seed; corrupted storage is recovered with a visible notice; no page-level horizontal scroll at 390 px (tables scroll inside their container); skip link is the first Tab stop.
- Transparency: SIMULATION DATA banner on every route; storage notice says no cross-device sync; header says "Prototipe"; footer "bukan sistem produksi"; extractor labelled "berbasis aturan, bukan AI". No live-emergency claims.
- Security scan: no API keys/secrets in the repo; substitute bundle contains no `AIza`, `GEMINI_API`, `supabase.co`, `service_role`, bearer tokens or JWTs. All seed records are fictional ("[SIMULASI]", "Desa Fiktif Jaya", etc.). The bundle still contains the word "gemini" in a dormant display branch and a stored-data schema enum; it is unreachable in the only mode the app starts in.

Data rules covered by automated tests (see §3): unverified never counted; exact duplicates not double-counted; potential duplicates need review; missing quantities stay null; units never combined; stock never negative; shortage deterministic (order-independent); reset/reload/corruption safe.

## 3. Test results
- Existing suite + new `tests/audit.test.ts` (15 tests) = **81 tests, 81 passed, 0 failed** (ai-extraction 19, audit 15, domain 32, services 12, workflow 3), run through a **stand-in runner**, not real Vitest. Caveats: `zod` resolved to 3.25.76's `zod/v4` API (project declares `^4.6.7`); `@google/genai` was stubbed (legacy server code only).
- Before the fixes, 6 of the 15 new tests failed (the six bugs above); after, all pass.
- Type check: non-React files (extractor, local repository/backend, draft, format, audit test) type-check clean with `tsc 6.0.3`. JSX components and `npm run typecheck` were **not** type-checked (no `@types/react`).
- **Official `npm test`: not run.**

## 4. Build results
- **Official `npm run build`: not run.** `npm run dev`: not run. `npm run preview`: not run.
- Substitute build (esbuild + Tailwind 4.3.3 compile of the real `src/index.css`): succeeded, `app.js` 493 kB minified, `app.css` 29 kB. Served with a static server with SPA fallback on port 4173 and exercised in Chromium (§2). This proves the source compiles, bundles and runs; it does not prove Vite's config, plugin chain or output are correct. The earlier report's figure (407 kB) is not reproduced here.

## 5. Deployment status
**Not deployed / not verified.** No Netlify deploy or public URL was available to check. `netlify.toml` reviewed by reading: build `npm run build`, publish `dist` (matches Vite's default), SPA redirect present, Node pinned. The risk that Netlify's Next.js auto-detection (`next` is still a dependency and `next.config.ts` exists) interferes is mitigated by `NETLIFY_NEXT_PLUGIN_SKIP=true`, which has not been confirmed on a real deploy.

## 6. Remaining limitations
- Data lives in one browser's `localStorage`; no sync between devices/browsers/users. Other tabs see changes on their next operation, not live.
- RuleBasedExtractor is intentionally simple: catalog items only; first mention per item; "air mineral 40 botol" (number after the item) and ALL-CAPS "DESA …" are left empty/unrecognised (safe, but the operator must type them); incident keywords are a short list.
- An identical text is blocked even if the earlier copy was rejected.
- The dashboard's "potential duplicate" count uses the flag stored at save time; it is not recomputed when the referenced report is later rejected.
- Legacy Next/Supabase/Gemini code remains in the repo (not built). Item/unit catalog is an unvalidated assumption.
- No manual screen-reader or keyboard-only audit; colour contrast was not measured; only Chromium was tested.

## 7. Steps the team must complete before submission
See SUBMISSION_CHECKLIST.md ("Incomplete" and "Unverified" sections) — in short: run `npm install && npm test && npm run build && npm run preview` on a networked machine; push; confirm the Netlify deploy and click through the public URL on desktop and phone; rehearse DEMO_GUIDE.md once on that URL.
