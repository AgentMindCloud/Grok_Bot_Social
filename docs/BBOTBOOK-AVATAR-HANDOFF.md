# BbotBook – Avatar Gallery Handoff
**Date:** 2026-08-24  
**Mode:** Ultra SuperGrok Heavy  
**Repo:** https://github.com/AgentMindCloud/bbotbook  
**Live:** https://agentmindcloud.github.io/bbotbook/

---

## Current Goal
Create a dedicated **Avatar Gallery** page (`/avatars`) on BbotBook where users can browse and download high-quality Grok Bot avatars for their own bots.

Source material: `GrokBotAvatars.zip` (provided by user)

---

## Source ZIP Facts
- Location (original): `/home/workdir/attachments/GrokBotAvatars.zip`
- Contains ~34 JPG sheets
- Actual size of each sheet: **1408 × 1408 px** (user said 1920, but files are 1408)
- Layout: perfect **4×4 grid** → each avatar cell = **352 × 352 px**
- After deduplication: ~32 unique sheets → **~512 individual avatars**

---

## Work Already Done
- ZIP extracted
- Grid size confirmed (352×352)
- Cropping of sheets into individual avatars started (ImageMagick)
- A full zip of cut avatars was prepared by the team (~15 MB)
- `/skills` page + Marketplace expansion already live
- Claims page updated with memory-contract + governance language
- Most bot profiles converted to liquid-glass + ShareOnX
- Cosmic background fixed
- `/avatars` page scaffold + `web/lib/avatarGallery.ts` (512-id manifest) already pushed

---

## Remaining Work
1. **Finish cutting** all unique sheets into individual 352×352 JPGs  
   Naming convention used: `gb-00-00.jpg` … `gb-31-33.jpg` (also `avatar-s01-c01.jpg` style acceptable)

2. **Upload** the individual avatars (or a clean zip) into the repo:
   ```
   web/public/avatars/gallery/
   ```

3. **Create / complete** the page:
   ```
   web/app/avatars/page.tsx
   ```
   - Liquid-glass / neon card grid
   - Show many avatars (lazy load or paginated)
   - Download button per avatar + “Download all” (zip)
   - Link from SiteHeader (`Avatars`)

4. Wire SiteHeader so `/avatars` appears in navigation

5. Optional: add a short “How to use these avatars” section for Grok Bot owners

---

## Technical Notes
- Next.js app uses `basePath: "/bbotbook"`
- Public assets are served under `/bbotbook/...`
- Prefer keeping avatars as JPG (quality ~85–90) to keep total size reasonable
- Because there are 500+ binary files, bulk upload via GitHub API is slow → prefer user uploads the prepared zip/folder, or do it in batches

---

## Success Criteria
- `/avatars` page is live and looks premium (matches the rest of BbotBook)
- Users can download individual avatars
- Option to download a full zip of all avatars
- Avatars are usable as profile pictures for Grok Bots
