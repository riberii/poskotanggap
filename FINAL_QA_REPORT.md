# Final QA Report — POSKOTANGGAP (2026-11-10)

## Critical bugs found and fixed
1. Netlify build failed: Next.js plugin auto-ran on the Vite output → `NETLIFY_NEXT_PLUGIN_SKIP=true` in `netlify.toml`.
2. Dashboard stock form used Next `useRouter` (crashes outside Next) → refetches summary via callback.
3. Header used `next/link`/`usePathname` → react-router.
4. Misleading copy told users to press "Analisis dengan AI"; extraction labels now say RuleBasedExtractor / not AI.
5. Vite config ESM warning → renamed to `vite.config.mts`.

## Verified (evidence)
- `npm test`: 4 files, 66 tests passed (incl. new `tests/workflow.test.ts`: extract → save pending → edit → verify → exact duplicate blocked → potential duplicate requires review → stock compare → reload → reset; corrupted storage recovery; missing location/quantity stay null).
- `npm run build`: success (dist 407 kB JS / 26 kB CSS).
- `vite preview` + headless Chromium (1280px and 390px): SIMULATION DATA banner shown, sample extracted with RuleBasedExtractor badge, verify succeeded, re-submit blocked as exact duplicate, dashboard showed the new area after reload, no console errors.
- `npm run dev`: dev server answered HTTP 200 on `/dashboard`.
- Not negative stock (schema + test), no unit conversion (aggregation by area+item+unit), only verified reports summed.

## Not verified
- Live Netlify deploy after the fix (previous deploy failed before the fix).
- Manual screen-reader/keyboard audit.

## Limitations
- Data lives only in this browser's localStorage; no sync across devices.
- Gemini/Supabase code is kept but disconnected; the Next.js legacy code is still in the repo.
