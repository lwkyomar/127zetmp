# Khazarium Tracker

A small, private web app where a group of friends can see each other's live
location on one map. It is a static site (React + TypeScript + Vite, built with
Leaflet and Supabase Realtime) that deploys to **GitHub Pages** — there is no
server of your own to run.

- **Map:** Leaflet + OpenStreetMap data (CARTO dark basemap).
- **Realtime:** Supabase Realtime (Broadcast + Presence). No database tables or
  SQL are required.
- **Location:** `navigator.geolocation.watchPosition()` with automatic recovery
  when the tab is backgrounded or the network drops.
- **Access:** a single shared group password on the entry screen.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> and create a free project.
2. Open **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **anon public** key

That is all the setup you need — Realtime Broadcast and Presence work out of the
box, with no tables or Row Level Security changes.

## 2. Configure the app locally

Copy `.env.example` to `.env` and paste the values:

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Install and run:

```bash
npm install
npm run dev
```

The app opens with the password screen. The group password is set in
`src/lib/auth.ts` (stored only as a SHA-256 hash). Change it there if you want a
different one — see "Changing the password" below.

## 3. Deploy to GitHub Pages

1. Push this project to a GitHub repository (the default branch must be `main`).
2. In the repository go to **Settings → Secrets and variables → Actions** and add
   two **repository secrets**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Push to `main` (or run the "Deploy to GitHub Pages" workflow manually). The
   site will be published at `https://<username>.github.io/<repository>/`.

`vite.config.ts` uses a **relative** base path (`base: './'`), so the same build
works no matter where Pages serves it from — a project page
(`https://<username>.github.io/<repository>/`) or a user/org page at the domain
root (`https://<username>.github.io/`). No repository name is hard-coded and the
workflow passes no `--base` flag.

---

## How it works

- After you sign in, the browser asks for location permission. When granted, the
  app starts `watchPosition()` and broadcasts your coordinates over Supabase
  Realtime.
- Each friend gets their own marker. Tap a marker to see the name and the time of
  the last update.
- **Stop sharing location** stops broadcasting immediately and removes your
  marker from the others' maps. **Start sharing location** turns it back on.
- A heartbeat re-broadcasts the last known position every 15 seconds so that a
  friend who joins later (or comes back after losing connection) still sees
  everyone, even when nobody is moving.
- The watcher restarts automatically when the tab becomes visible again, regains
  focus, or the network returns, so tracking keeps working in background tabs as
  far as the browser allows.

## Changing the password

The password is checked in the browser against a SHA-256 hash, so it is never
stored in plain text. To use a different password:

1. Compute the SHA-256 of the new password, e.g.:

   ```bash
   node -e "console.log(require('crypto').createHash('sha256').update('YOUR_NEW_PASSWORD').digest('hex'))"
   ```

2. Replace `PASSWORD_HASH` in `src/lib/auth.ts` with the printed value.

> Note: because this is a static site with no backend, the password check is a
> simple client-side gate, not real security. Keep the site private and only
> share the password and link with your friends.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server                 |
| `npm run build`   | Type-check and build to `dist/`      |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Type-check only                    |

## Tech

React 18 · TypeScript · Vite · Leaflet · Supabase Realtime
