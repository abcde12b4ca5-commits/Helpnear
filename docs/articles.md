# Blog articles (AI drafts, schedule, admin editor)

## What it does
- **Admin > Articles**: write an article by hand, or give a topic and get several *different* angles (different search questions), each saved as a **draft**. Edit, check the list "Before you publish", then publish.
- **Automatic**: the worker (it already ticks every 15 minutes) writes a new article every N days. "Drafts" is the safe mode. "Auto-publish" skips your review; search engines dislike many unreviewed articles.
- **Public pages**: `/blog` and `/blog/<search-phrase>`. They are rendered at the edge from Firestore (published articles only) by `functions/`, cached 5 minutes, and listed in `/sitemap-blog.xml` (already in `robots.txt`). Publishing also pings Bing (IndexNow) when `INDEXNOW_KEY` is set.
- Pictures: free Pexels photos with the photographer credit; video: a YouTube link (privacy-enhanced embed).

## One-time setup
1. **Worker** (`worker/`): `wrangler deploy` (the `[ai]` binding is already in `wrangler.toml`). Workers AI has a free daily allowance (10,000 "neurons"; about 20 articles a day with the default model). Optional: `wrangler secret put PEXELS_API_KEY` (free key at pexels.com/api) and set `INDEXNOW_KEY` in `wrangler.toml` to the key in `public/<key>.txt`.
2. **Firestore rules**: `firebase deploy --only firestore:rules` (new `articles` and `articleSettings` rules).
3. **Cloudflare Pages**: nothing to configure. The `functions/` folder is picked up on the next deploy. If your Firebase project id is not `helpnear-48ff5`, add the Pages variable `FIREBASE_PROJECT_ID`.
4. Open Admin > Articles > Automatic articles, choose the mode and the period, Save.

## Why several articles on one topic are different articles
Two articles on the same search question compete with each other and look like copied content. The generator therefore plans *angles* (cost drivers, how to prepare, mistakes, how to choose...) and warns when a title is too close to an existing one.

## Honest limits
- The model writes decent drafts, not finished work: always read before publishing. The checklist catches missing keywords, stock AI phrases, dollar amounts and near-duplicates; it cannot judge truth.
- Search volume is not known: the AI proposes natural search phrases. After a few weeks look at Search Console > Performance > Queries and write more about what already gets impressions.
- Change the AI model with the `AI_MODEL` variable (default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
