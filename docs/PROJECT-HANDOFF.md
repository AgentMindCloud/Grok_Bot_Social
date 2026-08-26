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

## 5. Hosting reality

Two different Hostinger products exist. Mixing them is what caused days of “site not working”.

### A. Hostinger Git deployment (Advanced → Git) — do not use

- Copies repo files as-is
- **Does not run Node / npm build**
- For static HTML, PHP, WordPress only
- **Do not use this on the source repo**

### B. Hostinger Node.js Web App — not required

- Can build Next.js
- Settings if used: root `web`, build `npm run build`, output `out`, no entry file
- Plan must support Node.js Web Apps
- Not the chosen path

### C. Retired path — Hostinger FTP

GitHub Actions FTP upload of `web/out/` was attempted on 2026-08-26 and then abandoned. Hostinger AI + owner decision: stop fighting FTP. Do not add `HOSTINGER_FTP_*` secrets. The workflow file was removed from main. Git history still has it.

### D. Chosen path — GitHub Pages + Hostinger DNS

**GitHub Actions builds the static site and GitHub Pages serves it. The domain stays registered at Hostinger.**

Workflow (on main):

`.github/workflows/pages.yml`

What it does on push to `main` or manual dispatch:

1. `npm install` in `web/`
2. `npm run build` → `web/out/`
3. Publish `web/out/` to GitHub Pages

GitHub Pages UI:

- Settings → Pages → Build and deployment = GitHub Actions
- Custom domain = `grokbotsocial.com`
- Enable Enforce HTTPS when the certificate is ready

CNAME files:

- `CNAME` (repo root)
- `web/public/CNAME` (lands in the export)

Hostinger DNS target:

```
@      A       185.199.108.153
@      A       185.199.109.153
@      A       185.199.110.153
@      A       185.199.111.153
www    CNAME   agentmindcloud.github.io
```

Keep MX if email exists. GitHub recommends configuring the custom domain in repository settings before changing DNS.

### Observed 2026-08-26 08:40 UTC (after the DNS change)

From the rebuild environment:

- Apex A records already equal the four GitHub Pages IPs above
- `https://grokbotsocial.com/` `/bots/` `/feed/` `/gallery/` `/join/` `/avatars/LunaBot.jpg` all returned **200** with `server: GitHub.com`
- `www.grokbotsocial.com` 301 → `https://grokbotsocial.com/`
- `agentmindcloud.github.io/Grok_Bot_Social/` 301 → the custom domain
- Pages workflow run 192 on `main` was green
- Apex `http://` still returned 200 without a forced HTTPS redirect — turn on **Enforce HTTPS** in Pages settings if it is not already on

Some resolvers can lag up to ~24h. Do not change DNS again unless a resolver is still pointing at Hostinger website IPs (`92.113.23.212` was the old one).

---

## 6. Rebrand leftovers that were fixed

- README rewritten + featured faces via raw GitHub avatar URLs
- `skill.md` + `FOR_BOTS.md` point at Grok_Bot_Social
- `web/app/layout.tsx` titles / OG → Grok Bot Social
- `SiteHeader` GitHub link → `AgentMindCloud/Grok_Bot_Social`
- Homepage footer + skill.md links updated
- Join page copy + prompt updated
- `web/package.json` name: `grok-bot-social`
- `DEPLOY.md` rewritten for GitHub Pages + Hostinger DNS (FTP retired)

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
- [x] Pages workflow publishing `web/out/`
- [x] Custom domain CNAME files
- [x] Live routes 200 on GitHub Pages (verified 2026-08-26 08:40 UTC from rebuild env)
- [x] FTP workflow retired

### Waiting on human

- [ ] Confirm Enforce HTTPS is on in Settings → Pages
- [ ] Confirm the same 200s from the owner's network / Singapore resolver
- [ ] Optional: GitHub repo About text
- [ ] Optional: delete leftover `HOSTINGER_FTP_*` secrets if they were ever added

### Later product work

- [ ] **Chill Arena** — future site section. User will specify. See `CHILL-ARENA.md`
- [ ] Higher-fidelity character variants (Canva / Grok Imagine) if faces still lag the mocks
- [ ] Dynamic share cards / stronger X integration
- [ ] Coalitions / temporary teams UI
- [ ] Network maps / dream mode
- [ ] Header density (many nav items vs mock's shorter nav)

---

## 8. How a new Grok chat should work

1. Read `PROJECT-INSTRUCTIONS.md` first
2. Read this handoff
3. Treat the four mocks as law for the four core pages
4. Commit and merge to **main** on `AgentMindCloud/Grok_Bot_Social`
5. Do not invent a backend
6. Do not use Hostinger Git-deploy-as-source
7. Do not revive FTP
8. Verify live site, then continue product work (Chill Arena when specified)

Useful live checks:

```text
https://grokbotsocial.com/
https://grokbotsocial.com/bots/
https://grokbotsocial.com/feed/
https://grokbotsocial.com/gallery/
https://grokbotsocial.com/join/
https://grokbotsocial.com/avatars/LunaBot.jpg
```

GitHub Actions:

- Pages (the real deploy): `.github/workflows/pages.yml`

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
10. FTP workflow pushed to main (2026-08-26) and then failed (no secrets)
11. User changed DNS toward GitHub Pages; Hostinger AI confirmed Pages + Hostinger-registered domain
12. This handoff created for a new Grok Project
13. Chill Arena noted as a future section
14. 2026-08-26 08:40 UTC: live domain already answering 200s from GitHub Pages; FTP path retired

---

## 10. Files to put in the new Grok Project folder

- `PROJECT-INSTRUCTIONS.md` — paste into Project Instructions
- `PROJECT-HANDOFF.md` — this file
- `CHILL-ARENA.md` — future feature stub
- Optional copies: `DEPLOY.md`, `README.md`, the four mock images if you still have them
