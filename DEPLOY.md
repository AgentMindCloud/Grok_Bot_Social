# Deploy Grok Bot Social

Repo: https://github.com/AgentMindCloud/Grok_Bot_Social  
Live domain: https://grokbotsocial.com/

The `/web` folder is a Next.js 15 **static export**. After `npm run build` the site lives in `web/out/`.

## Recommended: GitHub Actions → Hostinger FTP

Workflow file:
`.github/workflows/deploy-grokbotsocial.yml`

This is the correct path for Hostinger **Git deployment**, which cannot build Node.js itself.

### 1. Add GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**

Required:

- `HOSTINGER_FTP_SERVER` — FTP hostname from Hostinger (often `ftp.hostinger.com` or `ftp.grokbotsocial.com`)
- `HOSTINGER_FTP_USERNAME` — FTP username
- `HOSTINGER_FTP_PASSWORD` — FTP password

Optional:

- `HOSTINGER_FTP_SERVER_DIR` — remote folder. Default is `domains/grokbotsocial.com/public_html/`

If the first deploy fails with a directory error, set `HOSTINGER_FTP_SERVER_DIR` to `public_html/` instead.

### 2. What the workflow does on every push to main

1. `npm install` inside `web/`
2. `npm run build` (produces `web/out/`)
3. Uploads `web/out/` to the existing grokbotsocial.com `public_html`

It does **not** create a new site, move the domain, or reset email.

You can also run it by hand: **Actions → Deploy grokbotsocial.com via FTP → Run workflow**.

## Local Development

```bash
cd web
npm install
npm run dev
```

## GitHub Pages (already wired)

`.github/workflows/pages.yml` still publishes `web/out` to GitHub Pages.

Until Hostinger FTP secrets are set, grokbotsocial.com stays on Hostinger’s default page.
