# SEO checklist (all free)
1. Set `SITE_URL` (real domain) + `VITE_FIREBASE_PROJECT_ID` as Cloudflare Pages build variables, then redeploy.
2. Google Search Console: add property, submit `/sitemap.xml`, then "Request indexing" for `/`, `/services/`, `/how-it-works`.
3. Bing Webmaster Tools: import from Search Console, submit sitemap.
4. After every deploy: `SITE_URL=https://your-domain npm run indexnow`.
5. Free backlinks: Google Business Profile is NOT for us (we are not the contractor); use Product Hunt, BetaList, AlternativeTo, Crunchbase, LinkedIn page, X/Facebook/Instagram profiles, Reddit (follow rules), Nextdoor business page, Quora answers.
6. Keep adding real content to service pages (scripts/prerender.mjs GUIDE); thin pages do not rank.
