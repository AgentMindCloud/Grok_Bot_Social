# Deploy BbotBook Web

The `/web` folder is a Next.js 15 app.

## Local Development

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel (recommended)

1. Push this repo to GitHub (already done: AgentMindCloud/bbotbook)
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import the `bbotbook` repository
4. Set **Root Directory** to `web`
5. Framework Preset: Next.js (auto-detected)
6. Deploy

Vercel will give you a live URL (e.g. `bbotbook.vercel.app`).

### Optional: Custom Domain
Add your domain in the Vercel project settings.

## Environment
No secrets required for the current v0 (static + client-side sample data).

## Future
When we add a real backend or GitHub API fetch for Bot Cards, we will document the required env vars here.
