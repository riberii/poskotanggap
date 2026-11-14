# Submission Checklist

Legend: **Completed** = checked in this audit with evidence in FINAL_QA_REPORT.md. **Unverified** = believed true but not proven. **Incomplete** = not done.

## Completed
- [x] Two views (`/intake`, `/dashboard`) work end to end in Chromium at 1280 px and 390 px (substitute build, 64/64 checks, 0 console errors)
- [x] RuleBasedExtractor is the only extractor; labelled "berbasis aturan, bukan AI"; every field shows evidence or "tidak ditemukan"
- [x] Human verification required; unverified/unknown/total quantities never counted
- [x] Exact duplicates blocked; potential duplicates require explicit human confirmation
- [x] Missing quantities stay unknown; no unit conversion; stock never negative; shortage deterministic
- [x] Reload persistence, confirmed reset, corrupted-storage recovery, multi-tab safety, failed-write rollback
- [x] SIMULATION DATA banner on all routes; no cross-device-sync claim; no emergency-service claim
- [x] No secrets in repo or bundle; all seed data fictional
- [x] 81 tests pass **in a stand-in runner** (6 new regression tests for bugs fixed in this audit)
- [x] README, DEMO_GUIDE, FINAL_QA_REPORT, SUBMISSION_CHECKLIST updated; `.gitignore` added
- [x] `netlify.toml` reviewed: `npm run build`, publish `dist`, SPA fallback, Node 22, Next plugin skipped

## Unverified
- [ ] Official `npm test` (real Vitest, real zod 4.6.x) passes
- [ ] Official `npm run build` succeeds and `dist/` contains `index.html` + hashed assets
- [ ] `npm run dev` starts and `npm run preview` serves `dist/` correctly (deep link `/dashboard` works under preview)
- [ ] `npm run typecheck` is clean (JSX components were not type-checked)
- [ ] Netlify build succeeds with `NETLIFY_NEXT_PLUGIN_SKIP=true` while `next` is still a dependency
- [ ] Public URL: deep links, assets, no console errors, works on a real phone
- [ ] Keyboard-only and screen-reader pass; colour-contrast measurement; Safari/Firefox

## Incomplete
- [ ] Run the four npm commands above on a networked machine and record the real output
- [ ] Deploy and open the public URL; paste it into the submission form
- [ ] Rehearse DEMO_GUIDE.md once on the deployed URL (start with **Reset data simulasi**)
- [ ] Decide whether to delete the legacy Next/Supabase/Gemini code (`app/`, `proxy.ts`, `next.config.ts`, `supabase/`, `lib/supabase`, `lib/services/gemini-extractor.ts`) and unused dependencies — only after the deploy is confirmed
- [ ] Optional: `docs/AI_USAGE.md` / `docs/THIRD_PARTY.md` if the competition requires disclosure of AI-assisted development and third-party licences (not created; AI is advisory only, via Netlify AI Gateway)
- [ ] Validate the item/unit catalog and rule-extractor limits with a real posko operator (assumption today)
