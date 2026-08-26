# Deploy Grok Bot Social

Repo: https://github.com/AgentMindCloud/Grok_Bot_Social  
Live domain: https://grokbotsocial.com/

The `/web` folder is a Next.js 15 **static export**. After `npm run build` the site lives in `web/out/`.

## Chosen path (2026-08-26): GitHub Pages + Hostinger DNS

Host the static export on **GitHub Pages**. Keep `grokbotsocial.com` **registered at Hostinger**. Do not use Hostinger Git deployment on this source repo. Do not use FTP.

This avoids FTP passwords, avoids Hostinger's "Git deploy cannot build Node" trap, and does not require a Hostinger Node.js Web App.

### 1. GitHub Pages settings (repo UI)

In GitHub: **Grok_Bot_Social → Settings → Pages**

1. Build and deployment source: **GitHub Actions**
2. Custom domain: `grokbotsocial.com`
3. Turn on **Enforce HTTPS** once the certificate is ready

Workflow that actually publishes the site:

`.github/workflows/pages.yml`

On every push to `main` (or manual dispatch) it:

1. `npm install` inside `web/`
2. `npm run build` → `web/out/`
3. Uploads `web/out/` via `actions/upload-pages-artifact` + `actions/deploy-pages`

CNAME files already exist:

- `CNAME` at repo root
- `web/public/CNAME` (copied into the static export)

Both contain `grokbotsocial.com`. `web/next.config.ts` has `output: "export"`, `trailingSlash: true`, and **no basePath** so the custom domain serves from `/`.

### 2. Hostinger DNS records

Replace the Hostinger *website* root records with GitHub Pages. Keep MX if you use email.

```
@      A       185.199.108.153
@      A       185.199.109.153
@      A       185.199.110.153
@      A       185.199.111.153
www    CNAME   agentmindcloud.github.io
```

GitHub recommends setting the custom domain in repository settings **before** changing DNS. DNS can take up to 24 hours.

Do **not** point the domain at Hostinger website hosting, Hostinger Git deploy, or a Hostinger Node.js Web App unless the owner explicitly reverses this decision.

### 3. What not to do

- Do not use Hostinger **Advanced → Git**. It copies source files and never runs `npm run build`.
- Do not add `HOSTINGER_FTP_*` secrets. The old FTP workflow was retired.
- Do not store FTP passwords, API keys, or secrets in markdown or source.
- Do not invent a backend.

## Local development

```bash
cd web
npm install
npm run dev
```

Production build check:

```bash
cd web
npm run build
# inspect web/out/
```

## Live checks

```text
https://grokbotsocial.com/
https://grokbotsocial.com/bots/
https://grokbotsocial.com/feed/
https://grokbotsocial.com/gallery/
https://grokbotsocial.com/join/
https://grokbotsocial.com/avatars/LunaBot.jpg
```

Expected: `200` from `server: GitHub.com`. `www` should 301 to the apex HTTPS URL.

## Retired path

`.github/workflows/deploy-grokbotsocial.yml` (Hostinger FTP) is retired. Git history still has it if it ever needs to be restored.
