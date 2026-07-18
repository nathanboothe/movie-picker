# Movie/TV export goes here

Put your Collectorz export in this folder as `movies.csv` (or any `.csv`/`.xml`
filename — only one such file should be here at a time). This matches the
real export format confirmed from your catalog:

```
Title, Year, Runtime, Genres, Is TV Series, Series, Episode Count, Format, Rating
```

with **no header row** — just data, in that exact column order. For example:

```
"3:10 to Yuma","2007","122 mins","Action; Crime; Drama; Western","No","","0","Vudu","R"
"12 Monkeys: Season 1","2015","562 mins","Adventure; Drama","Yes","12 Monkeys","13","Vudu","TV-14"
```

- **Is TV Series**: `Yes` or `No`.
- **Series**: the show name, only populated for TV rows (blank for movies).
  A few rows in real exports leave this blank even for TV entries — the
  importer falls back to pulling a show name out of the Title in that case.
- **Episode Count**: number of episodes in that season. `0` means "this is a
  single episode/special, not a full season" — treated as 1 episode.
- **Format**: where you can watch it — semicolon-separated if more than one
  (e.g. `"Blu-ray; DVD; Vudu"`). Shown as a "Where to Watch" filter (pick one
  or more) and displayed on the result card as "Watch on ...".
- **Rating**: shown as the Rating filter in the app. Your export mixes MPAA
  (G/PG/PG-13/R), TV ratings (TV-G/TV-PG/TV-14/TV-MA/TV-Y7), and Collectorz's
  own classifications (e.g. "US - Approved", "US - Not Rated") — all of these
  just show up as filter options as-is, no special handling needed.

## How season numbers are figured out

There's no dedicated season-number column, so it's parsed out of the Title.
Real titles use several different conventions, all handled:
- `"Show: Season 3"` or `"Show - Season 3"`
- `"Show, Vol 1! Season 2"` (no punctuation required directly before "Season")
- `"Show: The Complete 2nd Season"` (ordinal digit)
- `"Show: The Complete Second Season"` (ordinal word, first–tenth)

If a title doesn't match any of these (e.g. "Friends: The Series Finale",
"...: Specials") **and** that show has other seasons in your catalog, it's
split off as its own standalone one-off entry (its own title becomes its
"series" of one) rather than being folded into the real season 1 — a wrong
guess there would silently overwrite that season's real episode count. The
build log tells you exactly which titles got this treatment; it's a
reasonable default for genuine specials/finales, but if you'd rather it be
tracked as part of the real season sequence instead, rename it in Collectorz
to include the right "Season N" and re-export.

If a title has no season info at all but is the *only* entry for that show
(e.g. a one-off miniseries), it's safely treated as season 1 of the real
show — no ambiguity possible there.

## Distinguishing movies with the same title and year

Occasionally two genuinely different catalog entries share both a title and
a year (e.g. two different "Mulan (1998)" entries with different runtimes).
The importer includes runtime in the key it uses to tell titles apart, so
these stay distinct rather than one silently overwriting the other. Truly
identical duplicate rows (same title, year, *and* runtime) still collapse
into a single entry, so your family won't get offered the same movie twice.

## Header-based exports still work too

If you ever export with a header row instead (e.g. from a different
Collectorz export template), the importer detects that automatically — it
checks whether column 2 of the first row is a 4-digit year; if not, it
treats the first row as a header and matches columns by name using the
`ALIASES` in `server/scripts/fieldAliases.js`.

## Re-exporting later

Whenever your **catalog** changes, re-export, replace the file here, commit,
and push. Render rebuilds the catalog automatically.

This is separate from **watch status and TV progress** (Watch/Already Seen/
Ignore, episode tracking) — that data lives on the app's persistent disk and
is untouched by catalog re-imports, so re-exporting never resets what your
family has already watched.
