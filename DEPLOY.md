# Deploy BbotBook Web

The `/web` folder is a Next.js 15 app configured for **static export** (GitHub Pages ready).

## Local Development

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to GitHub Pages (recommended for this repo)

1. Go to the repo **Settings → Pages**:  
   https://github.com/AgentMindCloud/bbotbook/settings/pages

2. Under **Build and deployment**:
   - Source: **GitHub Actions**

3. The workflow `.github/workflows/pages.yml` will automatically build and deploy on every push to `main`.

4. After the first successful run, the site will be live at:  
   **https://agentmindcloud.github.io/bbotbook/**

> If the site is at the root of the user/org domain instead, leave `basePath` commented in `web/next.config.ts`.  
> If it is under `/bbotbook`, uncomment `basePath: "/bbotbook"`.

## Deploy to Vercel (alternative)

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import `AgentMindCloud/bbotbook`
3. Set **Root Directory** to `web`
4. Deploy

## Environment

No secrets required for the current v0 (static + client-side sample data).
