# Blog articles (AI drafts, schedule, admin editor)

## What it does
- **Admin > Articles**: write an article by hand, or give a topic and get several *different* angles (different search questions), each saved as a **draft**. Edit, check the list "Before you publish", then publish.
- **Automatic**: the worker (it already ticks every 15 minutes) writes articles from a **title queue** you paste in the panel (see below). Everything is chosen in Admin > Articles > Automatic articles: how many per day, how many per title, and what happens to each article (draft, publish only if the quality checks pass, or publish with no review). Search engines dislike many unreviewed articles, so "publish only if the checks pass" or "drafts" is safer.
- **Public pages**: `/blog` and `/blog/<search-phrase>`. They are rendered at the edge from Firestore (published articles only) by `functions/`, cached 5 minutes, and listed in `/sitemap-blog.xml` (already in `robots.txt`). Publishing also pings Bing (IndexNow) when `INDEXNOW_KEY` is set.
- Pictures: free Pexels photos with the photographer credit; video: a YouTube link (privacy-enhanced embed).

## One-time setup
1. **Worker** (`worker/`): deploy it with `wrangler deploy`, or without a terminal: Cloudflare dashboard > Workers & Pages > helpnear-worker > Settings > Build > connect the GitHub repo (root directory `worker`, deploy command `npx wrangler deploy`); every push then updates the worker. Variables stay as they are (`keep_vars`). The `[ai]` binding is already in `wrangler.toml`. Workers AI has a free daily allowance (10,000 "neurons"; about 20 articles a day with the default model). Optional: `wrangler secret put PEXELS_API_KEY` (free key at pexels.com/api) and set `INDEXNOW_KEY` in `wrangler.toml` to the key in `public/<key>.txt`.
2. **Firestore rules**: `firebase deploy --only firestore:rules` (new `articles` and `articleSettings` rules).
3. **Cloudflare Pages**: nothing to configure. The `functions/` folder is picked up on the next deploy. If your Firebase project id is not `helpnear-48ff5`, add the Pages variable `FIREBASE_PROJECT_ID`.
4. Open Admin > Articles > Automatic articles, choose the mode, how many articles per day, paste your titles, Save.

## The title queue (Admin > Articles > Automatic articles)
- **Titles**: one per line, English, worked through from the top (up to 300). Each line may add a search phrase and a count: `Gutter cleaning before winter | gutter cleaning | x2`. Without a search phrase the AI picks one. Lines that cannot be used (too short, not English) are dropped when you save, and the panel says how many.
- **Articles per day**: 1 to 5 (or 1 to 5 per 2 days, 3 days, week). They are spread evenly: 3 per day is one every 8 hours, because the worker writes one article per tick.
- **Articles per title**: 1 to 3 (default in the panel, or `x1` to `x3` on a line). The first article uses your title as written; the extra ones are new angles on the same subject (a different search question each), never the same article reworded.
- **Publish modes**: *Draft* (you review), *Publish only if the quality checks pass* (otherwise a draft), *Publish everything* (no review). The checks that must pass: 900+ words, the search phrase in the title, first paragraph and a heading, 5+ different headings, 2+ links to your service pages, no stock AI phrases, no dollar amounts, not too similar to an existing article. A missing photo or a title/description a few characters off never stops it. In every mode an article too similar to an existing one stays a draft.
- **Write one article now** runs the next title immediately (save your changes first).
- A title that fails 3 times (for example the AI is busy) is skipped so it cannot block the list; the panel shows the reason. After a failure the worker retries within about 2 hours.
- If the Cloudflare free plan reports too many subrequests, lower the worker variable `CRON_SUBREQUEST_LIMIT` to 30.

## Why several articles on one topic are different articles
Two articles on the same search question compete with each other and look like copied content. The generator therefore plans *angles* (cost drivers, how to prepare, mistakes, how to choose...) and warns when a title is too close to an existing one.

## Honest limits
- The model writes decent drafts, not finished work: always read before publishing. The checklist catches missing keywords, stock AI phrases, dollar amounts and near-duplicates; it cannot judge truth.
- Search volume is not known: the AI proposes natural search phrases. After a few weeks look at Search Console > Performance > Queries and write more about what already gets impressions.
- Change the AI model with the `AI_MODEL` variable (default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
