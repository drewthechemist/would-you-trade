# Slab Showdown rebrand

This folder is a drop-in replacement for the **Would You Trade** Netlify site's repository root. It keeps the original Netlify functions and routes, including `/api/sync`, `/api/auto`, `/api/game`, and the daily scheduled function. It does **not** modify CompQuest.

## Deploy from an iPhone
1. Open your existing `would-you-trade` GitHub repository.
2. Replace the files under `public/` with the matching files in this ZIP, including `slab-showdown-logo.webp` and `favicon.png`. The simplest path is uploading those six public files to the existing `public` folder and committing the changes.
3. You do **not** need to replace the `netlify/functions/` files or change environment variables.
4. Wait for Netlify to publish the new deployment, then refresh the site in Safari.
5. Test the matchup, voting, results, and sharing.

The existing `wouldyoutrade.netlify.app` address remains valid. The Open Graph image uses this address; update it if you change domains later.

## Important
The ZIP is based on the launch-kit version uploaded, not a live snapshot of GitHub. If you have made subsequent edits in GitHub, upload **only the updated `public/` files**, preserving your latest backend code. The site retains existing Blob data as long as it stays in the same Netlify project.

Admin tokens remain in Netlify; no tokens are included in this archive.
