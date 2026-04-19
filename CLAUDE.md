# pdfcraftai.com — Claude Session Bootstrap

**This file is auto-loaded at the start of every session. READ IT FIRST before doing any deployment, env, or credential work.**

---

## 1. Project identity

- **Production URL:** https://pdfcraftai.com (apex + www)
- **Stack:** Next.js 14 (app router), NextAuth v5, Drizzle (MySQL)
- **Host:** Hostinger (managed Node.js Web App, `hpanel.hostinger.com/websites/pdfcraftai.com`)
- **CDN/Proxy:** Cloudflare (full proxy; confirmed via `cf-ray`, `server: cloudflare`)
- **GitHub repo:** `durgapoja6408-creator/pdfcraftai` (main branch deploys automatically)

## 2. Deployment flow — DO NOT edit via Hostinger file manager

**How code goes live:**
1. Commit + push to `main` on the GitHub repo
2. Hostinger's **GitHub App integration** auto-pulls and redeploys (takes ~2–3 min)

**You (Claude) have TWO persistent credentials the user already set up for you:**

### (a) GitHub Personal Access Token (classic)
- **Name:** `cowork-pdfcraftai-deploy` (assumed — CLAUDE.md previously said May 19, 2026; API reports expiration 2026-07-18 18:10:48 UTC, so the token in `.claude/secrets.env` has been rotated at least once)
- **Expires:** 2026-07-18 (verified via `github-authentication-token-expiration` response header, 2026-04-20)
- **Owner login:** `durgapoja6408-creator` (id 277461726)
- **Scopes:** `repo`, `workflow`, `read:network_configurations`
- **Where stored on user's side:** GitHub → Settings → Developer Settings → Tokens (classic)
- **How you use it:** After the user pastes it into chat or into `.claude/secrets.env` (see section 4), use it to `git clone https://<PAT>@github.com/durgapoja6408-creator/pdfcraftai.git`, commit, and `git push`.

### (b) Hostinger SSH key
- **Name on Hostinger:** `cowork-apr2026-v2` (original `cowork-apr2026` was rotated on 2026-04-19 because its private half was lost)
- **Key comment:** `cowork-20260419@claude`
- **Algorithm:** ed25519
- **Status on Hostinger:** ACTIVE (verified via `ssh ... 'whoami'` → `u692382124` on `us-imm-web534.main-hosting.eu`)
- **What it grants:** Shell access to the Hostinger server (for runtime debugging, log tailing, `pm2` control, etc.)
- **SSH endpoint:** `u692382124@212.85.28.206:65002`
- **Private key path (sandbox):** `/sessions/gifted-funny-franklin/mnt/pdfcraftai.com/.claude/id_ed25519_cowork` (chmod 600, gitignored)
- **How to connect:** `ssh -i .claude/id_ed25519_cowork -p 65002 u692382124@212.85.28.206`
- **CAVEAT:** the private key lives in the sandbox. If the sandbox is wiped, regenerate with `ssh-keygen -t ed25519 -C "cowork-<date>@claude" -f .claude/id_ed25519_cowork -N ""`, add the new .pub to Hostinger (SSH Access → Add SSH key), then delete the old entry.

## 3. Known infra IDs (safe to keep in the repo)

| Item | Value |
|---|---|
| Google OAuth Client ID | `912612566698-n1857n8qa60n2sb55qag7sn2fi9bgias.apps.googleusercontent.com` |
| Google Cloud project | `pdfcraftai` |
| GA4 Measurement ID | `G-2Y8PS0S93F` |
| GA4 Stream ID | `14383455005` |
| Microsoft Clarity Project ID | `wcsbv536zv` |
| GitHub repo | `durgapoja6408-creator/pdfcraftai` |

**Secrets NOT in this file** (env vars live on Hostinger; PAT + SSH private key live only in `.claude/secrets.env`):
`GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `MYSQL_URL`, and the PAT/SSH private key itself.

## 4. Credentials handoff pattern — `.claude/secrets.env`

When the user pastes credentials, save them to `.claude/secrets.env` (already gitignored). Format:

```bash
# GitHub PAT for pushing to durgapoja6408-creator/pdfcraftai
GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Hostinger SSH (use as -i flag; private key body, NOT path)
HOSTINGER_SSH_USER=u123456789
HOSTINGER_SSH_HOST=192.0.2.1
HOSTINGER_SSH_PORT=65002
HOSTINGER_SSH_PRIVATE_KEY_PATH=/sessions/gifted-funny-franklin/mnt/pdfcraftai.com/.claude/id_ed25519_cowork
```

**Any future Claude session should:**
1. Read this `CLAUDE.md` first
2. Check if `.claude/secrets.env` exists → source it
3. If missing, ask the user: *"I see there's a `cowork-pdfcraftai-deploy` PAT and a `cowork-apr2026-v2` Hostinger SSH key already set up on your side. Please paste them into chat so I can store them in `.claude/secrets.env` for this session."*

## 5. Known operational gotchas

- **503 after deploy** → hPanel → Resource Usage → **Stop running process** → app auto-restarts → 503 clears.
- **Do NOT push-force to main** — Hostinger's GitHub App treats it as a normal push and may redeploy mid-state.
- **Env var changes require "Save and redeploy"** in Hostinger → this restarts the runtime but doesn't pull new code; pushing to main pulls new code AND restarts.

## 6. Current integration status (as of 2026-04-20)

- Cloudflare proxy: ACTIVE
- Sitemap (`/sitemap.xml`): serving 200 — **but old submissions in GSC + Bing point at stale URLs; needs re-submission after latest redeploy**
- Google OAuth: env vars deployed, consent verified (branding page, 2026-04-19) — **end-to-end sign-in test still pending**
- Microsoft Clarity: committed + pushed in `36034eb` (2026-04-20); Hostinger redeploy in flight
- GA4: committed + pushed in `36034eb` (2026-04-20); Hostinger redeploy in flight

## 7. Files to ALWAYS consult

- `CLAUDE.md` (this file) — session bootstrap (credentials + infra)
- **`docs/STATUS.md` — live punch list: what's DONE, what's PENDING, who owns each. Read this IMMEDIATELY after CLAUDE.md at session start.**
- `docs/DEPLOYMENT_NOTES.md` — detailed env vars, integration status, recovery playbook
- `app/layout.tsx` — analytics / tracking scripts live here
- `auth.ts` / `auth.config.ts` — NextAuth v5 Google provider wiring

## 8. Session hygiene

When you finish a meaningful piece of work:
1. Update `docs/STATUS.md` — move the item from Pending → Done with the date and verification evidence (command, commit SHA, screenshot).
2. If the work involved a deploy, bump the commit SHA in `docs/DEPLOYMENT_NOTES.md` §Production environment.
3. Commit these doc changes to the repo (`docs/STATUS.md` + `docs/DEPLOYMENT_NOTES.md` + `CLAUDE.md` are all tracked) so they survive sandbox wipes and fresh clones.

**NEVER commit `.claude/` contents** — that directory holds secrets and is gitignored. If `.gitignore` ever stops covering it, fix that BEFORE any other work.
