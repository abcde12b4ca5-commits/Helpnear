# Architecture (Phase 0)
- Vite + React + TS strict + Tailwind v3, SPA on Cloudflare Pages (`public/_redirects` = SPA fallback).
- Firebase Spark: Auth + Firestore only. No Cloud Functions. Rules are the backend (Phase 1).
- Brand lives only in `src/config/brand.ts`.
- Firebase access goes through `src/lib/` (typed data layer added from Phase 1).
