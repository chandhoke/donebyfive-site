# donebyfive-site

Landing page for **DoneByFive** — retail operations templates, deployed on
Cloudflare Workers.

## Structure

- `public/index.html` — the landing page (served as a static asset).
- `src/index.js` — the Worker: serves the static site and handles newsletter
  signups at `POST /api/subscribe`, storing them in a D1 database.
- `wrangler.toml` — Worker + assets + D1 configuration.

## Email signup setup (one-time)

The signup form posts to `/api/subscribe`, which writes to a D1 database. You
need to create that database once and add its ID to `wrangler.toml`:

```bash
# 1. Create the database (copy the database_id from the output)
npx wrangler d1 create donebyfive-subscribers

# 2. Paste that id into wrangler.toml, replacing REPLACE_WITH_YOUR_D1_DATABASE_ID
```

The `subscribers` table is created automatically on the first signup, so no
manual migration step is required.

## Viewing / exporting signups

```bash
# List signups
npx wrangler d1 execute donebyfive-subscribers --remote \
  --command "SELECT email, created_at FROM subscribers ORDER BY created_at DESC"

# Export to JSON
npx wrangler d1 execute donebyfive-subscribers --remote --json \
  --command "SELECT email, created_at FROM subscribers" > subscribers.json
```

## Local development

```bash
npx wrangler dev
```

Deploys happen automatically via the Cloudflare Workers Builds Git integration
on push to `main`.
