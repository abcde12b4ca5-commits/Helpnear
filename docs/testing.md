# Testing guide

Everything runs on **fake data** (the Firebase emulators, project `demo-helpnear`). No test ever touches your real Firebase project or real users.

## One-time setup
```
npm install
npx playwright install chromium     # browser for E2E
# Java 21+ is needed for the Firebase emulators (rules, integration, E2E journey)
# k6 for performance: https://grafana.com/docs/k6/latest/set-up/install-k6/
```

## Commands
| Command | What it checks | Needs |
|---|---|---|
| `npm run lint` / `npm run typecheck` | code quality, types | - |
| `npm run test:unit` | pure logic: money, geohash/radius matching, errors, labels, cache, keyword filter, `_headers`, rules sanity | - |
| `npm run test:worker` | Cloudflare Worker: JWT, push, policy | - |
| `npm run test:rules` | Firestore security rules (53 tests) + the site's real data layer against those rules (integration) | Java |
| `npm run test:e2e:public` | real browser: pages, forms, access control, XSS, SEO files, accessibility, phone layout | build |
| `npm run test:e2e` | everything above + the full user journey (sign up, post, accept, agree, done, confirm, sign out/in) and refusal cases | Java |
| `npm run build && npm run preview` then `npm run test:perf` | k6 load test of the static site (finds the "knee") | k6 |
| `LIVE_URL=https://helpnear.pages.dev npm run test:live` | READ-ONLY checks of the live site (headers, caching, sitemap, no exposed files, Firestore denies strangers) | - |
| `npm run test:all` | lint + types + all of the above | Java, browser |

Open the last browser report with `npx playwright show-report`.

See `docs/hardening.md` for the Cloudflare/Firebase quota protection and what to switch on in the consoles.

## Performance test safety
`tests/perf/run.mjs` refuses to run against `*.googleapis.com`, `*.firebaseio.com`, `*.workers.dev`. Load on those uses your free daily quota
(Firestore Spark = 50,000 reads/day) and would take the site down. Against a remote site it needs `I_OWN_THIS_SITE=yes` and uses lower rates.

## CI (`.github/workflows/ci.yml`) is an alarm, not a gate
Every push and pull request runs: quality (lint, types, unit, worker, audit, build, bundle-size guard), rules + integration, browser E2E, k6.
Cloudflare Pages deploys by itself on every push to `main`, so a red job does NOT stop the release: fix it or revert the commit.
To check the live site after a deploy: GitHub > Actions > "Live site check" > Run workflow (read-only).
To turn the CI into a real gate later: pause Cloudflare's automatic deployments and trigger a Pages Deploy Hook from a job that `needs` the test jobs (a Git-connected Pages project cannot use `wrangler` uploads).

See `docs/hardening.md` for the Cloudflare/Firebase quota protection and what to switch on in the consoles.

## Performance test safety
`tests/perf/run.mjs` refuses to run against `*.googleapis.com`, `*.firebaseio.com`, `*.workers.dev`. Load on those uses your free daily quota
(Firestore Spark = 50,000 reads/day) and would take the site down. Against a remote site it needs `I_OWN_THIS_SITE=yes` and uses lower rates.

## CI/CD (`.github/workflows/ci.yml`)
Every push and pull request runs: quality (lint, types, unit, worker, audit, build, bundle-size guard), rules + integration, browser E2E, k6.
**Deploy** runs only on `main`, only if all four passed, and only when the repository variable `DEPLOY_ENABLED` is `true`. Then a read-only smoke test hits the live site.

### One-time setup to make the gate real
Cloudflare Pages is connected to GitHub, and a Git-connected Pages project **cannot be switched to wrangler uploads**. So the pipeline uses a Pages **Deploy Hook**:
automatic builds are switched off, and only the CI job (after every test passed) calls the hook. Step by step (Arabic): `docs/setup-steps.md`, section 1.
Secrets/variables used: secret `CLOUDFLARE_DEPLOY_HOOK`, variable `DEPLOY_ENABLED=true` (optional `SITE_URL`).
