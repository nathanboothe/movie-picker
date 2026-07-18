# Movie Picker

Pick a random movie from your Collectorz-cataloged collection, filtered by genre,
MPAA rating, and release year range. Built the same way as
[Coastal Elder Connect](https://github.com/nathanboothe/coastal-elder-scheduler):
React (Vite) + Express, deployed to Render via GitHub push only — no local Node
required.

## How it works

- **Data source:** you export your collection from Collectorz (CSV recommended,
  XML also supported) and commit that file to `/data`.
- **Build time (on Render, not your machine):** `server/scripts/buildDb.js` reads
  that export and builds a SQLite file (`server/data/movies.db`).
- **Runtime:** the Express server reads `movies.db` **read-only** to answer
  `/api/filters` and `/api/pick`. Nothing is written to disk at runtime, so
  Render's free-tier ephemeral filesystem is a non-issue — the data that matters
  is baked into every deploy.
- **Frontend:** a single filter screen (genre chips, rating chips, year range) and
  a "Pick a Movie" button that calls `/api/pick`, with a re-roll option.

## Repo layout

```
movie-picker/
├── data/                   ← put your Collectorz export here (.csv or .xml)
├── server/
│   ├── index.js            ← Express app (API + serves the built client)
│   ├── lib/db.js           ← read-only SQLite accessor
│   └── scripts/
│       ├── buildDb.js      ← build-time: export → movies.db
│       ├── parseCsv.js
│       ├── parseXml.js
│       └── fieldAliases.js ← column/tag name mapping — edit this if your
│                              export's headers don't match
├── client/                 ← React + Vite frontend
├── render.yaml             ← Render service definition
└── package.json            ← root build/start scripts Render runs
```

## First-time setup

1. **Export your collection from Collectorz.** See `data/README.md` for exact
   steps — CSV with a header row is the easiest path.
2. Put the export file in `/data`, replacing the placeholder.
3. Create the GitHub repo `nathanboothe/movie-picker` and push this project.
4. In Render: **New → Blueprint**, point it at the repo. `render.yaml` already
   defines the service (free plan, `npm run build` / `npm start`).
5. Render builds and gives you a `.onrender.com` URL.

## Re-exporting later

Whenever your collection changes: re-export from Collectorz, replace the file
in `/data`, commit, push. Render rebuilds `movies.db` automatically — no manual
step needed on the server side.

## If the build fails

- **"No .csv or .xml export found"** — you haven't added an export file to `/data` yet.
- **"Could not find a Title column"** — your CSV's header for the title field
  doesn't match what's expected. Add it to `title` in `server/scripts/fieldAliases.js`.
- **"Could not locate a repeating movie element"** (XML) — the heuristic in
  `parseXml.js` couldn't find your movie records. Easiest fix: switch to a CSV
  export instead.
- **`better-sqlite3` fails to build on Render** — this is a native module; Render's
  build environment supports it out of the box, but if you see node-gyp errors,
  confirm the `NODE_VERSION` in `render.yaml` matches what better-sqlite3 has
  prebuilt binaries for at the time you deploy.

## Local development (optional)

You don't need this for deployment, but if you ever want to test locally with
Node installed:

```
npm run build   # builds client, installs server deps, builds movies.db
npm start        # runs the server at http://localhost:3000
```
