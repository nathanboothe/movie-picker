# Movie Picker

Pick a random movie or TV show from your Collectorz-cataloged collection,
filtered by genre, MPAA rating, and release year range — with per-family
watch tracking (Watch / Already Seen / Ignore) and TV episode progress
across multiple shows at once. Built the same way as
[Coastal Elder Connect](https://github.com/nathanboothe/coastal-elder-scheduler):
React (Vite) + Express, deployed to Render via GitHub push only — no local
Node required.

## How it works

Two separate SQLite databases, for two very different lifecycles:

- **`server/data/catalog.db`** — your movies and TV seasons. Rebuilt from
  scratch on every deploy from whatever export sits in `/data`. Read-only at
  runtime. Doesn't need to survive a restart, so it's fine that it's not on
  the persistent disk.
- **A `state.db` on the Render persistent disk** (`$DATA_DIR/state.db`) —
  Watch/Already-Seen/Ignore status and TV episode progress. This is written
  to constantly as your family uses the app, and **must** survive deploys
  and restarts — which is why this app needs a paid Render plan with a disk
  attached (the free tier's filesystem is wiped on every deploy/restart).

Catalog rows use a **stable key** derived from their content (title+year for
movies, series+season for TV) rather than their database row ID, since row
IDs aren't stable across rebuilds. This is what lets watch-status in
`state.db` stay correctly matched to the right movie/show even after you
re-export and redeploy.

### Movies
Pick a movie matching your filters. Buttons: **Watch**, **Already Seen**,
**Ignore** (all three exclude it from every future pick, permanently) and
**Re-roll** (just picks a different one, no exclusion).

### TV Shows
Choosing "TV Show" first checks for series already in progress and offers to
**resume** them, alongside a "Start Something New" option.

- **Starting a new show** picks a series you haven't touched yet (filtered
  using its Season 1 metadata) and starts you at S1E1.
- **Watch** marks the currently-shown episode watched and advances to the
  next one, rolling over to the next season automatically using each
  season's episode count. Hitting the last episode of the last season you
  own marks the series **completed** (excluded from future picks, like
  Already Seen).
- **Already Seen** / **Ignore** resolve the *whole series*, not just the
  current season.
- **Resuming** a series asks whether you've watched more than one episode
  since last time. If yes, it asks what episode you're on now and marks
  everything before that as watched — useful if the family watched some
  episodes outside the app.
- Multiple shows can be tracked in progress simultaneously; each has its own
  independent progress record.

## Installing on your phone (no App Store needed)

The app is a Progressive Web App (PWA) — your family can install it as a
real home-screen app directly from the browser, no app store account or
approval process required:

- **iOS (Safari):** open the site, tap the **Share** button, then **Add to
  Home Screen**.
- **Android (Chrome):** open the site, tap the **⋮** menu, then **Add to
  Home Screen** or **Install app** (Chrome sometimes prompts this
  automatically).

Either way, it gets its own icon and opens full-screen with no browser bar —
indistinguishable from a "real" app for everyday use.

## Repo layout

```
movie-picker/
├── data/                    ← put your Collectorz export here (.csv or .xml)
├── server/
│   ├── index.js             ← Express app (API + serves the built client)
│   ├── lib/
│   │   ├── catalogDb.js     ← read-only catalog accessor
│   │   ├── stateDb.js       ← read-write status/progress accessor (persistent disk)
│   │   └── picker.js        ← candidate queries + episode-progress math
│   └── scripts/
│       ├── buildDb.js       ← build-time: export → catalog.db
│       ├── parseCsv.js / parseXml.js
│       ├── fieldAliases.js  ← column/field mapping — edit this if your
│       │                       export's headers don't match
│       └── keys.js          ← stable key generation
├── client/                  ← React + Vite frontend
├── render.yaml               ← Render service definition (paid plan + disk)
└── package.json              ← root build/start scripts Render runs
```

## First-time setup

1. **Export your collection from Collectorz.** See `data/README.md` for
   exact steps, including the TV-specific fields (Series Title, Season
   Number, Episode Count, and whatever marks a row as TV vs movie).
2. Put the export file in `/data`, replacing the placeholder.
3. Create the GitHub repo `nathanboothe/movie-picker` and push this project.
4. In Render: **New → Blueprint**, point it at the repo. `render.yaml`
   defines a **Starter** instance ($7/mo) with a 1 GB persistent disk
   (~$0.25/mo) — this is a paid service, unlike the first version of this
   app, because watch-status has to survive deploys.
5. Render builds and gives you a `.onrender.com` URL.

## Re-exporting the catalog later

Whenever your collection changes: re-export from Collectorz, replace the
file in `/data`, commit, push. Render rebuilds `catalog.db` automatically.
Watch status and TV progress live on the persistent disk and are untouched
by this — nobody's progress resets when you add new movies.

## If the build fails

- **"No .csv or .xml export found"** — you haven't added an export file to `/data` yet.
- **"Could not find a Title column"** — add your CSV's exact title header to
  `title` in `server/scripts/fieldAliases.js`.
- **TV rows aren't showing up as TV** — check what value your export
  actually puts in the format/category column and make sure it's listed in
  `TV_MEDIA_TYPE_VALUES` in `fieldAliases.js`.
- **"Could not locate a repeating movie/season element"** (XML) — switch to
  a CSV export instead; it's much more reliable for imports.
- **`better-sqlite3` fails to build on Render** — native module; Render's
  build environment supports it out of the box, but if you see node-gyp
  errors, confirm `NODE_VERSION` in `render.yaml` still matches a version
  better-sqlite3 has prebuilt binaries for.

## Local development (optional)

You don't need this for deployment, but if you ever want to test locally
with Node installed:

```
npm run build   # builds client, installs server deps, builds catalog.db
npm start        # runs the server at http://localhost:3000
                  # (state.db falls back to server/data/ locally, since
                  #  there's no persistent disk outside Render)
```
