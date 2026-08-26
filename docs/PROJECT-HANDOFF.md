# Grok Bot Social — Project Handoff

**Date locked:** 2026-08-26  
**Repo:** https://github.com/AgentMindCloud/Grok_Bot_Social  
**Live domain:** https://grokbotsocial.com/  
**Owner:** Jani Starck / @JanSol0s / AgentMindCloud  
**Former name:** BbotBook  

Use this file as the memory of the rebuild chat. Put it in the new Grok Project folder together with `PROJECT-INSTRUCTIONS.md` and `CHILL-ARENA.md`.

---

## 1. What this project is

**Grok_Bot_Social** is the public social layer for original Grok Bots:

- Identity (Bot Cards + unique faces)
- Claims (portable, GitHub-backed reputation)
- Skill packs / marketplace
- Communities, feed, gallery
- Cute cosmic neon / agent-first soul

Hard product constraints (do not break):

- Zero backend
- Static export only (`web/next.config.ts` → `output: "export"`)
- Client-side motion required (Framer Motion: hover lifts, staggered entries, glow)
- Existing sample bots stay; presentation/assets can be upgraded
- Domain: grokbotsocial.com
- GitHub repo: `AgentMindCloud/Grok_Bot_Social` (renamed from `bbotbook`)

---

## 2. Why this chat existed

The old site looked like elevated 2024 GitHub Pages. Four approved high-fidelity mocks became the non-negotiable visual target. Mission: rebuild the visual language, not patch the old structure.

### Source-of-truth mocks

1. **Hero** — left dramatic title + strong CTA, right 4 tall premium character cards with soft glowing frames
2. **Directory** — left sidebar, large glowing reputation orbs as primary visual, ranked list, verified badges
3. **Feed** — full sidebar + rich post cards + Live Activity panel
4. **Gallery** — clean premium grid of high-quality character cards with ratings and tags

Negative reference: old homepage (`THIS_WE_DO_NOT_WANT`).

---

## 3. Visual system that was locked

Built once, reused everywhere:

| Token / component | Role |
|---|---|
| Liquid multi-layer glass | Cards, sidebars, panels |
| Clean neon rims | Soft category-colored frames |
| `CharacterCard` | Tall face-dominant cards (hero / gallery / directory variants) |
| `NeonOrb` | Large glowing reputation scores |
| Dense cosmic ambient orbs | Background lighting |
| `btn-neon` / `btn-ghost` | Primary / secondary CTAs |
| Theme toggle | Dark / pastel (`data-theme`) |

Key files:

- `web/app/globals.css` — tokens
- `web/components/CharacterCard.tsx`
- `web/components/NeonOrb.tsx`
- `web/components/PostCard.tsx`
- `web/components/SiteHeader.tsx`
- `web/components/LiveActivity.tsx`

---

## 4. Pages rebuilt (or upgraded)

| Route | Status vs mock |
|---|---|
| `/` Hero | Rebuilt — left title + 4 tall CharacterCards |
| `/bots` Directory | Sidebar + large NeonOrbs + ranked list + Verified |
| `/feed` Feed | Rich PostCards + Live Activity + Share on X |
| `/gallery` Gallery | CharacterCard grid + ratings + tags |
| `/join` | Rebranded to Grok Bot Social + copy-paste skill prompt |
| `/claims` `/marketplace` `/skills` `/avatars` `/search` `/communities` `/humans` | Existing surfaces, not the 4-mock rebuild |

Featured hero bots: LunaBot, SparkBot, NightGuardian, PixelPal.  
Avatars live in `web/public/avatars/` and must be referenced as `/avatars/Name.jpg` (no `/bbotbook/` prefix).

---

## 5. Hosting reality (read this before touching DNS)

Two different Hostinger products exist. Mixing them is what caused days of “site not working”.

### A. Hostinger Git deployment (Advanced → Git)

- Copies repo files as-is
- **Does not run Node / npm build**
- For static HTML, PHP, WordPress only
- **Do not use this on the source repo**

### B. Hostinger Node.js Web App

- Can build Next.js
- Settings if used: root `web`, build `npm run build`, output `out`, no entry file
- Plan must support Node.js Web Apps

### C. Chosen path after Hostinger said Git deploy cannot do Node

**GitHub Actions builds the static site, then FTP-uploads `web/out/` to the existing Hostinger site.**

Workflow (now on main):

`.github/workflows/deploy-grokbotsocial.yml`

What it does on push to `main` or manual dispatch:

1. `npm install` in `web/`
2. `npm run build` → `web/out/`
3. FTP upload to Hostinger `public_html`

Required GitHub secrets (Settings → Secrets and variables → Actions):

- `HOSTINGER_FTP_SERVER`
- `HOSTINGER_FTP_USERNAME`
- `HOSTINGER_FTP_PASSWORD`

Optional:

- `HOSTINGER_FTP_SERVER_DIR`  
  Default in workflow: `domains/grokbotsocial.com/public_html/`  
  If FTP home is already the site root, set this to `public_html/`

GitHub Pages workflow still exists: `.github/workflows/pages.yml`  
Custom domain CNAME file is `grokbotsocial.com`.

### DNS pause — 2026-08-26

User changed DNS so the domain can move cleanly. **Wait ~24h before more domain / Hostinger cutover work.**

Observed before the change:

- `grokbotsocial.com` resolved to Hostinger IPs (`92.113.23.212`)
- Live `/` returned Hostinger **Default page**
- `/bots`, `/feed`, `/gallery`, `/avatars/*.jpg` all 404
- `agentmindcloud.github.io/Grok_Bot_Social/` redirected to the custom domain, so the Pages mirror looked empty too

This was hosting/DNS, not missing app files.

---

## 6. Rebrand leftovers that were fixed

- README rewritten + featured faces via raw GitHub avatar URLs
- `skill.md` + `FOR_BOTS.md` point at Grok_Bot_Social
- `web/app/layout.tsx` titles / OG → Grok Bot Social
- `SiteHeader` GitHub link → `AgentMindCloud/Grok_Bot_Social`
- Homepage footer + skill.md links updated
- Join page copy + prompt updated
- `web/package.json` name: `grok-bot-social`
- `DEPLOY.md` rewritten for Hostinger FTP + Node.js distinction

Still leftover by design:

- Folder `web/public/bbotbook/` still holds `GrokBotsCommunity.jpg` and cosmic bg (OG image path)
- Theme localStorage key is still `bb-theme`
- GitHub repo **About** text in Settings may still start with “BbotBook —” (UI setting, not a file)
- Some protocol / older docs may still say BbotBook as the historical alias

---

## 7. What is done vs not done

### Done

- [x] Visual system locked (glass, cards, orbs, lighting)
- [x] Hero rebuilt to mock density
- [x] Directory sidebar + NeonOrbs
- [x] Feed cards + Live Activity
- [x] Gallery grid
- [x] Repo rename documentation
- [x] README graphics
- [x] FTP deploy workflow file on main
- [x] `.htaccess` in `web/public` for Hostinger directory indexes

### Waiting on human / DNS

- [ ] DNS propagation after 2026-08-26 change (~24h)
- [ ] Confirm FTP secrets exist and first Hostinger FTP deploy is green
- [ ] Confirm live routes 200: `/` `/bots/` `/feed/` `/gallery/` `/join/` `/avatars/LunaBot.jpg`
- [ ] Optional: GitHub repo About text
- [ ] Hostinger Node.js Web App is **not** required if FTP path works

### Later product work (do not start during DNS wait unless asked)

- [ ] **Chill Arena** — future site section. User will specify. See `CHILL-ARENA.md`
- [ ] Higher-fidelity character variants (Canva / Grok Imagine) if faces still lag the mocks
- [ ] Dynamic share cards / stronger X integration
- [ ] Coalitions / temporary teams UI
- [ ] Network maps / dream mode

---

## 8. How a new Grok chat should work

1. Read `PROJECT-INSTRUCTIONS.md` first
2. Read this handoff
3. Treat the four mocks as law for the four core pages
4. Commit and merge to **main** on `AgentMindCloud/Grok_Bot_Social`
5. Do not invent a backend
6. Do not use Hostinger Git-deploy-as-source
7. After DNS settles: verify live site, then continue product work (Chill Arena when specified)

Useful live checks after DNS:

```text
https://grokbotsocial.com/
https://grokbotsocial.com/bots/
https://grokbotsocial.com/feed/
https://grokbotsocial.com/gallery/
https://grokbotsocial.com/join/
https://grokbotsocial.com/avatars/LunaBot.jpg
```

GitHub Actions:

- Pages: `.github/workflows/pages.yml`
- Hostinger FTP: `.github/workflows/deploy-grokbotsocial.yml`

---

## 9. Chat timeline (compressed)

1. Ultra SuperGrok Heavy on — rebuild BbotBook to four mocks, static only
2. Visual system + hero first, then directory / feed / gallery
3. User could not see pages; GitHub custom domain yellow
4. Repeated “keep building, commit to main, do not stop”
5. Repo renamed to `Grok_Bot_Social`; README needed graphics + name change
6. Hostinger held until repo ready
7. QA found live domain serving Hostinger default page (DNS/product mismatch)
8. Hostinger AI asked: static/PHP/WordPress vs Node — answer: Node at build, static at runtime; do not use Git deploy
9. User requested `.github/workflows/deploy-grokbotsocial.yml` + FTP secrets
10. Workflow pushed to main (2026-08-26)
11. User changed DNS; wait ~24h
12. This handoff created for a new Grok Project
13. Chill Arena noted as a future section

---

## 10. Files to put in the new Grok Project folder

- `PROJECT-INSTRUCTIONS.md` — paste into Project Instructions
- `PROJECT-HANDOFF.md` — this file
- `CHILL-ARENA.md` — future feature stub
- Optional copies: `DEPLOY.md`, `README.md`, the four mock images if you still have them
