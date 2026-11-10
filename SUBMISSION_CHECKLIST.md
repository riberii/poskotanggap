# Submission Checklist
## Completed (evidence in FINAL_QA_REPORT.md)
- [x] Vite + React + TS + Tailwind; `dev`/`build`/`preview`/`test` scripts
- [x] Intake & Dashboard views, localStorage persistence, reset with confirmation
- [x] RuleBasedExtractor active, evidence-gated, human verification required
- [x] Exact/potential duplicates, verified-only aggregation, no unit mixing, non-negative stock
- [x] 66 tests pass; production build succeeds; preview tested in headless browser
- [x] Netlify config: `npm run build`, publish `dist`, SPA fallback, Next plugin skipped
## Unverified
- [ ] Successful Netlify deploy and public URL check after the config fix
- [ ] Manual accessibility (keyboard / screen reader) pass
## Incomplete
- [ ] Remove legacy Next.js code (`app/`, `proxy.ts`, `next.config.ts`) and unused deps once deploy is confirmed
- [ ] `docs/AI_USAGE.md`, `docs/THIRD_PARTY.md`
- [ ] Update README install section to the Vite commands
