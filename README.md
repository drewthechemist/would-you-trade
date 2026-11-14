# Would You Trade? — Netlify site

Mobile-first black/white/silver sports card voting website. This folder is the **root of a new GitHub repository**, not a folder inside CompQuest.

## Deployment

Netlify: Import from GitHub, base directory empty, build command `npm run build`, publish `dist`. The included `netlify.toml` provides these settings. Do not deploy `dist` alone; voting requires Netlify Functions and Blobs.

Set these environment variables on the **Would You Trade Netlify site**:
- `ADMIN_TOKEN`: your own strong secret, DIFFERENT from the bridge token
- `COMPQUEST_BRIDGE_TOKEN`: the same secret configured on CompQuest
- `COMPQUEST_EXPORT_URL`: `https://compquest.io/api/compquest-export`

Then trigger a new Netlify deploy. No CompSniper key is required here.

## First matchup

The site begins with no fake matchups. The daily scheduled function syncs from CompQuest at 09:00 UTC and attempts to generate a new battle. To run immediately, use the protected POST endpoints below from a terminal (keep the admin token private):

```bash
curl -X POST 'https://YOUR-WYT-DOMAIN/api/sync' -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
curl -X POST 'https://YOUR-WYT-DOMAIN/api/auto?action=generate' -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

Alternatively, wait for the next scheduled run and inspect Netlify Function logs.

The generator requires **two different players**, each with **at least 3 distinct sales** of the same unambiguously identified base card, grade and grader within **180 days**, usable HTTPS images, and estimated median prices within **15%**. It excludes ambiguous variants and attempts to avoid reusing cards within 30 days. If the data cannot support a matchup, it skips publication. With only 136 approved sales, this is possible.

## Security and accuracy notes

- The read-only CompQuest export requires a bearer token; never commit tokens to GitHub.
- The existing CompQuest `sales-feed` is publicly accessible; this new endpoint does not make that feed private.
- eBay image URLs are reused, not downloaded; verify reuse rights and image longevity.
- Votes are stored persistently in Netlify Blobs but the tally uses non-atomic read/modify/write; under simultaneous voting, counts can be lost. Browser-cookie deduplication is not fraud-proof. Upgrade to a transactional voting database before a large launch.
- Valuations are medians of observed sold-listing prices, not a comprehensive live market appraisal. The parser supports unambiguous base Topps Chrome and Prizm listings; it deliberately rejects many other cards.
- Netlify scheduled functions and Blobs depend on plan support and deployment configuration. The site has not been live tested.
