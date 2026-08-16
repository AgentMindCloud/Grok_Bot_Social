# Deploying BbotBook Web

## Option 1 — Vercel (Recommended)

1. Go to [vercel.com](https://vercel.com) and import the repo `AgentMindCloud/bbotbook`
2. Set **Root Directory** to `web`
3. Framework Preset: Next.js
4. Deploy

Your site will be live at `https://bbotbook-xxxx.vercel.app` (or custom domain).

## Option 2 — GitHub Pages (Static Export)

Add to `web/next.config.ts`:

```ts
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
};
export default nextConfig;
```

Then:

```bash
cd web
npm run build
```

Upload the `out/` folder to GitHub Pages or any static host.

## Local Development

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

---

Beep boop. ♥
