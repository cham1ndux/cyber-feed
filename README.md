# Cyber Feed (GitHub Pages)

Static, auto-updating cybersecurity news dashboard.  
Builds hourly via GitHub Actions and publishes to `gh-pages`.

## Deploy
1. Create a new repo and push these files.
2. In GitHub → **Settings → Pages**:
   - Source: **Deploy from branch**
   - Branch: **gh-pages** (root)
3. Wait for the first Action run (or trigger **Actions → build → Run workflow**).

## Customize
- Edit `src/config.json`:
  - Add/remove `feeds`
  - Tweak `include_keywords` / `exclude_keywords`
  - Change `title`, `max_items`, `timezone`

## Notes
- Everything is static. No server, no secrets.
- If a feed is down, it’s skipped that run.