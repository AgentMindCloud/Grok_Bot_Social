# Grok Bot Social — Project Instructions

Paste this entire file into the Grok Project **Instructions** field.

---

You are working on **Grok_Bot_Social** (live: grokbotsocial.com), the cute cosmic-neon social universe for original Grok Bots. Former name: BbotBook. Repo: https://github.com/AgentMindCloud/Grok_Bot_Social

Owner: Jani / @JanSol0s / AgentMindCloud. Always commit and merge finished work to **main**.

## Product law

- Zero backend. Static export only (`output: "export"` in `web/next.config.ts`). Output folder is `web/out/`.
- Strong client-side motion (Framer Motion): hover lifts, staggered entries, glowing reactions.
- Keep the cute cosmic neon / agent-first soul. Do not flatten into generic SaaS.
- Existing sample bots stay (LunaBot, SparkBot, NightGuardian, PixelPal, DeepDive, StoryWeaver, CoalitionRunner, VibeGuardian, HelperBot 2.0). Upgrade presentation, do not invent a new cast unless asked.
- Avatar paths are root-relative: `/avatars/LunaBot.jpg`. Never prefix `/bbotbook/`.
- Four approved mocks are the visual source of truth for Hero, Directory, Feed, Gallery. Do not drift.

## Visual system (reuse, do not fork)

- Liquid multi-layer glass + clean neon rims
- `CharacterCard` for tall face-dominant cards
- `NeonOrb` for large reputation scores
- Dense ambient cosmic orbs
- Tokens live in `web/app/globals.css`

## Hosting law

- Hostinger **Git deployment** cannot build this repo. Do not tell the user to use it on source.
- **Chosen path:** GitHub Pages hosts the static Next export. `grokbotsocial.com` stays registered at Hostinger. No FTP. No Hostinger Node.js Web App unless the owner reverses this.
- Workflow: `.github/workflows/pages.yml` builds `web/` and publishes `web/out/`.
- GitHub Pages UI: Settings → Pages → Build and deployment = GitHub Actions. Custom domain = `grokbotsocial.com`. Enable Enforce HTTPS when the cert is ready.
- Hostinger DNS target records (keep MX if email exists):

```
@      A       185.199.108.153
@      A       185.199.109.153
@      A       185.199.110.153
@      A       185.199.111.153
www    CNAME   agentmindcloud.github.io
```

- GitHub recommends setting the custom domain in repo settings before changing DNS. DNS can take up to 24 hours.
- The old FTP workflow and `HOSTINGER_FTP_*` secrets are retired. Do not revive them. Do not store secrets in markdown or source.
- Alternate (not active): Hostinger Node.js Web App with root=`web`, build=`npm run build`, output=`out`, no entry file.

## How to work

1. Read `PROJECT-HANDOFF.md` in this project folder before coding.
2. Inspect current `main` on GitHub before editing.
3. Rebuild or refine against the four mocks. No incremental patches that fight the new visual language.
4. After code changes: commit to main. Confirm the **Deploy to GitHub Pages** Action is green.
5. Verify live 200s on `/` `/bots/` `/feed/` `/gallery/` `/join/` and `/avatars/LunaBot.jpg`.
6. Do not store FTP passwords, API keys, or secrets in markdown or source.

## Known later feature

**Chill Arena** will become a section on grokbotsocial.com. User will specify. Do not invent the design. See `CHILL-ARENA.md`. When they describe it, design it in the same glass/neon system and add a route + header link.

## Success

The live site should feel like a 2026 premium product UI, not an elevated static GitHub Pages theme, while remaining a zero-backend static export.
