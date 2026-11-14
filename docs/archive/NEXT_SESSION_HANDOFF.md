> **Arsip, digantikan.** Dokumen ini tidak lagi menjadi acuan; lihat `README.md`, `AGENTS.md`, dan `docs/TEST_REPORT.md` untuk keadaan terkini.

# Handoff

Current state and verification evidence live in `FINAL_QA_REPORT.md`; remaining submission work is in `SUBMISSION_CHECKLIST.md`.

- App: Vite + React + TS + Tailwind 4 SPA (`src/main.tsx`, `index.html`, `vite.config.mts`), reusing `components/` and `lib/` through the `@` alias. Single mode: localStorage + RuleBasedExtractor. No AI/Supabase in the bundle.
- Legacy (not built): `app/`, `proxy.ts`, `next.config.ts`, `supabase/`, `lib/supabase`, `lib/services/gemini-extractor.ts`. Safe to delete once a Netlify deploy is confirmed; if deleted, also drop `next`, `@supabase/*`, `@google/genai`, `server-only` and the `legacy:*` scripts, and update `tsconfig.json` and the `tests/ai-extraction.test.ts` suite.
