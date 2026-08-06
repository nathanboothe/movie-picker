import { useEffect, useState, useCallback } from 'react';
import { getJson, postJson } from './apiClient.js';

function Chip({ label, active, onClick, variant = 'include' }) {
  const activeClass = variant === 'exclude' ? 'chip--exclude-active' : 'chip--active';
  return (
    <button type="button" className={`chip${active ? ` ${activeClass}` : ''}`} onClick={onClick} aria-pressed={active}>
      {label}
    </button>
  );
}

export default function App() {
  const [view, setView] = useState('home'); // home | movieFilters | movieResult | tvHome | tvFilters | tvResult | tvResumeQuestion | tvCatchUp
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');

  // Movie state
  const [movieFilters, setMovieFilters] = useState(null);
  const [movieGenres, setMovieGenres] = useState(new Set());
  const [movieExcludeGenres, setMovieExcludeGenres] = useState(new Set());
  const [movieRatings, setMovieRatings] = useState(new Set());
  const [movieFormats, setMovieFormats] = useState(new Set());
  const [movieYearFrom, setMovieYearFrom] = useState('');
  const [movieYearTo, setMovieYearTo] = useState('');
  const [moviePick, setMoviePick] = useState(null); // { result, poolSize } | null
  const [movieEmpty, setMovieEmpty] = useState(false);

  // TV state
  const [inProgress, setInProgress] = useState([]);
  const [tvFilters, setTvFilters] = useState(null);
  const [tvGenres, setTvGenres] = useState(new Set());
  const [tvExcludeGenres, setTvExcludeGenres] = useState(new Set());
  const [tvRatings, setTvRatings] = useState(new Set());
  const [tvFormats, setTvFormats] = useState(new Set());
  const [tvYearFrom, setTvYearFrom] = useState('');
  const [tvYearTo, setTvYearTo] = useState('');
  const [tvEmpty, setTvEmpty] = useState(false);
  const [tvActive, setTvActive] = useState(null); // currently displayed up-next episode
  const [resumeTarget, setResumeTarget] = useState(null); // series being resumed (pre-question)
  const [catchUpSeason, setCatchUpSeason] = useState('');
  const [catchUpEpisode, setCatchUpEpisode] = useState('');

  function toggle(setFn, value) {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  // Toggles `value` in `setFn`'s set, and — if turning it on — removes it
  // from `setOtherFn`'s set, since a genre can't be both included and
  // excluded at once.
  function toggleGenreExclusive(setFn, setOtherFn, value) {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
        setOtherFn((prevOther) => {
          if (!prevOther.has(value)) return prevOther;
          const nextOther = new Set(prevOther);
          nextOther.delete(value);
          return nextOther;
        });
      }
      return next;
    });
  }

  function resetNotices() {
    setErrorMsg('');
    setNotice('');
  }

  // ---- Movie flow ----

  function goToMovies() {
    resetNotices();
    setMoviePick(null);
    setMovieEmpty(false);
    setBusy(true);
    getJson('/api/filters?type=movie')
      .then((data) => {
        setMovieFilters(data);
        setMovieYearFrom(data.minYear != null ? String(data.minYear) : '');
        setMovieYearTo(data.maxYear != null ? String(data.maxYear) : '');
        setView('movieFilters');
      })
      .catch(() => setErrorMsg('Could not load the movie catalog. Try refreshing.'))
      .finally(() => setBusy(false));
  }

  const pickMovie = useCallback(
    (excludeKey) => {
      setBusy(true);
      resetNotices();
      postJson('/api/pick', {
        mediaType: 'movie',
        genres: Array.from(movieGenres),
        excludeGenres: Array.from(movieExcludeGenres),
        ratings: Array.from(movieRatings),
        formats: Array.from(movieFormats),
        yearFrom: movieYearFrom ? Number(movieYearFrom) : null,
        yearTo: movieYearTo ? Number(movieYearTo) : null,
        excludeKey: excludeKey ?? null,
      })
        .then((data) => {
          if (!data.result) {
            setMoviePick(null);
            setMovieEmpty(true);
          } else {
            setMoviePick(data);
            setMovieEmpty(false);
            setView('movieResult');
          }
        })
        .catch(() => setErrorMsg('Something went wrong picking a movie. Try again.'))
        .finally(() => setBusy(false));
    },
    [movieGenres, movieExcludeGenres, movieRatings, movieFormats, movieYearFrom, movieYearTo]
  );

  function resolveMovie(action) {
    if (!moviePick) return;
    setBusy(true);
    resetNotices();
    postJson('/api/resolve', { key: moviePick.result.key, action })
      .then(() => {
        setNotice(
          action === 'watch' ? 'Marked as watched.' : action === 'seen' ? 'Marked as already seen.' : 'Ignored — won\u2019t suggest it again.'
        );
        pickMovie(null);
      })
      .catch(() => setErrorMsg('Could not update that movie. Try again.'))
      .finally(() => setBusy(false));
  }

  // ---- TV flow ----

  function goToTv() {
    resetNotices();
    setTvActive(null);
    setBusy(true);
    getJson('/api/tv/in-progress')
      .then((data) => {
        setInProgress(data.series || []);
        setView('tvHome');
      })
      .catch(() => setErrorMsg('Could not load your in-progress shows. Try refreshing.'))
      .finally(() => setBusy(false));
  }

  function goToTvFilters() {
    resetNotices();
    setTvEmpty(false);
    setBusy(true);
    getJson('/api/filters?type=tv')
      .then((data) => {
        setTvFilters(data);
        setTvYearFrom(data.minYear != null ? String(data.minYear) : '');
        setTvYearTo(data.maxYear != null ? String(data.maxYear) : '');
        setView('tvFilters');
      })
      .catch(() => setErrorMsg('Could not load the TV catalog. Try refreshing.'))
      .finally(() => setBusy(false));
  }

  const pickTv = useCallback(
    (excludeKey) => {
      setBusy(true);
      resetNotices();
      postJson('/api/pick', {
        mediaType: 'tv',
        genres: Array.from(tvGenres),
        excludeGenres: Array.from(tvExcludeGenres),
        ratings: Array.from(tvRatings),
        formats: Array.from(tvFormats),
        yearFrom: tvYearFrom ? Number(tvYearFrom) : null,
        yearTo: tvYearTo ? Number(tvYearTo) : null,
        excludeKey: excludeKey ?? null,
      })
        .then((data) => {
          if (!data.result) {
            setTvActive(null);
            setTvEmpty(true);
          } else {
            setTvActive({ ...data.result, fromFreshPick: true });
            setTvEmpty(false);
            setView('tvResult');
          }
        })
        .catch(() => setErrorMsg('Something went wrong picking a show. Try again.'))
        .finally(() => setBusy(false));
    },
    [tvGenres, tvExcludeGenres, tvRatings, tvFormats, tvYearFrom, tvYearTo]
  );

  function startResume(series) {
    resetNotices();
    setResumeTarget(series);
    setCatchUpSeason('');
    setCatchUpEpisode('');
    setView('tvResumeQuestion');
  }

  function resumeNoExtra() {
    if (!resumeTarget) return;
    setBusy(true);
    resetNotices();
    postJson('/api/tv/resume', { seriesKey: resumeTarget.seriesKey, watchedMoreThanOne: false })
      .then((data) => {
        if (data.completed) {
          setNotice(`Looks like you've already finished ${data.seriesTitle}. Marked it complete.`);
          goToTv();
        } else {
          setTvActive({ ...data.result, fromFreshPick: false });
          setView('tvResult');
        }
      })
      .catch(() => setErrorMsg('Could not resume that series. Try again.'))
      .finally(() => setBusy(false));
  }

  function submitCatchUp(e) {
    e.preventDefault();
    if (!resumeTarget || !catchUpSeason || !catchUpEpisode) return;
    setBusy(true);
    resetNotices();
    postJson('/api/tv/resume', {
      seriesKey: resumeTarget.seriesKey,
      watchedMoreThanOne: true,
      season: Number(catchUpSeason),
      episode: Number(catchUpEpisode),
    })
      .then((data) => {
        if (data.completed) {
          setNotice(`Marked ${data.seriesTitle} as complete.`);
          goToTv();
        } else {
          setTvActive({ ...data.result, fromFreshPick: false });
          setView('tvResult');
        }
      })
      .catch(() => setErrorMsg('Could not update that series. Check the season/episode numbers.'))
      .finally(() => setBusy(false));
  }

  function markTvWatched() {
    if (!tvActive) return;
    setBusy(true);
    resetNotices();
    postJson('/api/tv/watch', {
      seriesKey: tvActive.seriesKey,
      seriesTitle: tvActive.seriesTitle,
      season: tvActive.season,
      episode: tvActive.episode,
    })
      .then((data) => {
        if (data.completed) {
          setNotice(`🎉 All caught up on ${tvActive.seriesTitle}!`);
          goToTv();
        } else {
          setNotice(`Marked S${tvActive.season}E${tvActive.episode} watched.`);
          setTvActive({
            mediaType: 'tv',
            seriesKey: tvActive.seriesKey,
            seriesTitle: tvActive.seriesTitle,
            season: data.nextUp.season,
            episode: data.nextUp.episode,
            mpaaRating: data.nextUp.mpaaRating,
            formats: data.nextUp.formats,
            fromFreshPick: false,
          });
        }
      })
      .catch(() => setErrorMsg('Could not mark that episode watched. Try again.'))
      .finally(() => setBusy(false));
  }

  function resolveTv(action) {
    if (!tvActive) return;
    setBusy(true);
    resetNotices();
    postJson('/api/tv/resolve', { seriesKey: tvActive.seriesKey, action })
      .then(() => {
        setNotice(action === 'seen' ? 'Marked as already seen.' : 'Ignored — won\u2019t suggest it again.');
        goToTv();
      })
      .catch(() => setErrorMsg('Could not update that series. Try again.'))
      .finally(() => setBusy(false));
  }

  return (
    <div className="app">
      <header className="marquee">
        <span className="marquee__eyebrow">Now Deciding</span>
        <h1 className="marquee__title">What Are We Watching?</h1>
      </header>

      {notice && <p className="notice">{notice}</p>}
      {errorMsg && <p className="error">{errorMsg}</p>}

      {view === 'home' && (
        <section className="type-choice">
          <button type="button" className="type-card" onClick={goToMovies} disabled={busy}>
            <span className="type-card__label">Movie</span>
          </button>
          <button type="button" className="type-card" onClick={goToTv} disabled={busy}>
            <span className="type-card__label">TV Show</span>
          </button>
        </section>
      )}

      {view === 'movieFilters' && movieFilters && (
        <>
          <FilterPanel
            filters={movieFilters}
            selectedGenres={movieGenres}
            selectedExcludeGenres={movieExcludeGenres}
            selectedRatings={movieRatings}
            selectedFormats={movieFormats}
            yearFrom={movieYearFrom}
            yearTo={movieYearTo}
            onToggleGenre={(g) => toggleGenreExclusive(setMovieGenres, setMovieExcludeGenres, g)}
            onToggleExcludeGenre={(g) => toggleGenreExclusive(setMovieExcludeGenres, setMovieGenres, g)}
            onToggleRating={(r) => toggle(setMovieRatings, r)}
            onToggleFormat={(f) => toggle(setMovieFormats, f)}
            onYearFrom={setMovieYearFrom}
            onYearTo={setMovieYearTo}
          />
          <div className="pick-bar">
            <button type="button" className="back-link" onClick={() => setView('home')}>
              &larr; Back
            </button>
            <button type="button" className="ticket-button" onClick={() => pickMovie(null)} disabled={busy}>
              {busy ? 'Rolling the reel…' : 'Pick a Movie'}
            </button>
          </div>
          {movieEmpty && <p className="result__empty">No movies match those filters. Try widening your search.</p>}
        </>
      )}

      {view === 'movieResult' && moviePick && (
        <section className="result">
          <div className="result-card">
            <div className="result-card__sprockets" aria-hidden="true" />
            <h3 className="result-card__title">{moviePick.result.title}</h3>
            <p className="result-card__meta">
              {moviePick.result.year ?? 'Year unknown'}
              {moviePick.result.mpaaRating ? ` · ${moviePick.result.mpaaRating}` : ''}
              {moviePick.result.runtimeMinutes ? ` · ${moviePick.result.runtimeMinutes} min` : ''}
            </p>
            {moviePick.result.genres?.length > 0 && <p className="result-card__genres">{moviePick.result.genres.join(' · ')}</p>}
            {moviePick.result.formats?.length > 0 && (
              <p className="result-card__formats">Watch on {moviePick.result.formats.join(', ')}</p>
            )}
            <p className="result-card__pool">
              {moviePick.poolSize} movie{moviePick.poolSize === 1 ? '' : 's'} matched your filters
            </p>
            <div className="action-row">
              <button type="button" className="action-button action-button--watch" onClick={() => resolveMovie('watch')} disabled={busy}>
                Watch
              </button>
              <button type="button" className="action-button" onClick={() => resolveMovie('seen')} disabled={busy}>
                Already Seen
              </button>
              <button type="button" className="action-button action-button--muted" onClick={() => resolveMovie('ignore')} disabled={busy}>
                Ignore
              </button>
              <button type="button" className="reroll-button" onClick={() => pickMovie(moviePick.result.key)} disabled={busy}>
                Re-roll
              </button>
            </div>
          </div>
        </section>
      )}

      {view === 'tvHome' && (
        <section className="tv-home">
          {inProgress.length > 0 ? (
            <>
              <h2 className="section-heading">Pick up where you left off</h2>
              <ul className="series-list">
                {inProgress.map((s) => (
                  <li key={s.seriesKey} className="series-list__item">
                    <div>
                      <p className="series-list__title">{s.seriesTitle}</p>
                      <p className="series-list__meta">
                        {s.nextUp ? `Up next: Season ${s.nextUp.season}, Episode ${s.nextUp.episode}` : 'All caught up'}
                      </p>
                    </div>
                    <button type="button" className="resume-button" onClick={() => startResume(s)} disabled={busy}>
                      Resume
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="filter-group__empty">No shows in progress yet.</p>
          )}
          <div className="pick-bar">
            <button type="button" className="back-link" onClick={() => setView('home')}>
              &larr; Back
            </button>
            <button type="button" className="ticket-button" onClick={goToTvFilters} disabled={busy}>
              Start Something New
            </button>
          </div>
        </section>
      )}

      {view === 'tvFilters' && tvFilters && (
        <>
          <FilterPanel
            filters={tvFilters}
            selectedGenres={tvGenres}
            selectedExcludeGenres={tvExcludeGenres}
            selectedRatings={tvRatings}
            selectedFormats={tvFormats}
            yearFrom={tvYearFrom}
            yearTo={tvYearTo}
            onToggleGenre={(g) => toggleGenreExclusive(setTvGenres, setTvExcludeGenres, g)}
            onToggleExcludeGenre={(g) => toggleGenreExclusive(setTvExcludeGenres, setTvGenres, g)}
            onToggleRating={(r) => toggle(setTvRatings, r)}
            onToggleFormat={(f) => toggle(setTvFormats, f)}
            onYearFrom={setTvYearFrom}
            onYearTo={setTvYearTo}
          />
          <div className="pick-bar">
            <button type="button" className="back-link" onClick={() => setView('tvHome')}>
              &larr; Back
            </button>
            <button type="button" className="ticket-button" onClick={() => pickTv(null)} disabled={busy}>
              {busy ? 'Rolling the reel…' : 'Pick a Show'}
            </button>
          </div>
          {tvEmpty && <p className="result__empty">No shows match those filters. Try widening your search.</p>}
        </>
      )}

      {view === 'tvResumeQuestion' && resumeTarget && (
        <section className="result">
          <div className="result-card">
            <h3 className="result-card__title">{resumeTarget.seriesTitle}</h3>
            <p className="result-card__meta">
              You were on Season {resumeTarget.lastWatchedSeason || 1}, Episode {resumeTarget.lastWatchedEpisode || 0}
            </p>
            <p className="question">Have you watched more than one episode since last time?</p>
            <div className="action-row">
              <button type="button" className="action-button action-button--watch" onClick={() => setView('tvCatchUp')} disabled={busy}>
                Yes
              </button>
              <button type="button" className="action-button" onClick={resumeNoExtra} disabled={busy}>
                No
              </button>
            </div>
            <button type="button" className="back-link" onClick={() => setView('tvHome')}>
              &larr; Back
            </button>
          </div>
        </section>
      )}

      {view === 'tvCatchUp' && resumeTarget && (
        <section className="result">
          <form className="result-card" onSubmit={submitCatchUp}>
            <h3 className="result-card__title">{resumeTarget.seriesTitle}</h3>
            <p className="question">What episode are you on now?</p>
            <div className="year-range">
              <label>
                <span className="input-label">Season</span>
                <input type="number" min="1" value={catchUpSeason} onChange={(e) => setCatchUpSeason(e.target.value)} required />
              </label>
              <label>
                <span className="input-label">Episode</span>
                <input type="number" min="1" value={catchUpEpisode} onChange={(e) => setCatchUpEpisode(e.target.value)} required />
              </label>
            </div>
            <div className="action-row">
              <button type="submit" className="action-button action-button--watch" disabled={busy}>
                Update Progress
              </button>
            </div>
            <button type="button" className="back-link" onClick={() => setView('tvResumeQuestion')}>
              &larr; Back
            </button>
          </form>
        </section>
      )}

      {view === 'tvResult' && tvActive && (
        <section className="result">
          <div className="result-card">
            <div className="result-card__sprockets" aria-hidden="true" />
            <h3 className="result-card__title">{tvActive.seriesTitle}</h3>
            <p className="result-card__meta">
              Season {tvActive.season} · Episode {tvActive.episode}
              {tvActive.mpaaRating ? ` · ${tvActive.mpaaRating}` : ''}
            </p>
            {tvActive.genres?.length > 0 && <p className="result-card__genres">{tvActive.genres.join(' · ')}</p>}
            {tvActive.formats?.length > 0 && <p className="result-card__formats">Watch on {tvActive.formats.join(', ')}</p>}
            <div className="action-row">
              <button type="button" className="action-button action-button--watch" onClick={markTvWatched} disabled={busy}>
                Watch
              </button>
              <button type="button" className="action-button" onClick={() => resolveTv('seen')} disabled={busy}>
                Already Seen
              </button>
              <button type="button" className="action-button action-button--muted" onClick={() => resolveTv('ignore')} disabled={busy}>
                Ignore
              </button>
              {tvActive.fromFreshPick && (
                <button type="button" className="reroll-button" onClick={() => pickTv(tvActive.seriesKey)} disabled={busy}>
                  Re-roll
                </button>
              )}
            </div>
            <button type="button" className="back-link" onClick={goToTv}>
              &larr; Back to shows
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function FilterPanel({
  filters,
  selectedGenres,
  selectedExcludeGenres,
  selectedRatings,
  selectedFormats,
  yearFrom,
  yearTo,
  onToggleGenre,
  onToggleExcludeGenre,
  onToggleRating,
  onToggleFormat,
  onYearFrom,
  onYearTo,
}) {
  return (
    <section className="filters">
      <div className="filter-group">
        <h2>Genre</h2>
        <div className="chip-row">
          {filters.genres.length === 0 && <p className="filter-group__empty">No genres found in your catalog.</p>}
          {filters.genres.map((g) => (
            <Chip key={g} label={g} active={selectedGenres.has(g)} onClick={() => onToggleGenre(g)} />
          ))}
        </div>
      </div>

      {filters.genres.length > 0 && (
        <div className="filter-group">
          <h2>Exclude Genre</h2>
          <p className="filter-group__hint">Tap a genre to leave it out, even if it overlaps with something you picked above.</p>
          <div className="chip-row">
            {filters.genres.map((g) => (
              <Chip
                key={g}
                label={g}
                variant="exclude"
                active={selectedExcludeGenres.has(g)}
                onClick={() => onToggleExcludeGenre(g)}
              />
            ))}
          </div>
        </div>
      )}

      {filters.formats?.length > 0 && (
        <div className="filter-group">
          <h2>Where to Watch</h2>
          <div className="chip-row">
            {filters.formats.map((f) => (
              <Chip key={f} label={f} active={selectedFormats.has(f)} onClick={() => onToggleFormat(f)} />
            ))}
          </div>
        </div>
      )}

      {filters.ratings.length > 0 && (
        <div className="filter-group">
          <h2>Rating</h2>
          <div className="chip-row">
            {filters.ratings.map((r) => (
              <Chip key={r} label={r} active={selectedRatings.has(r)} onClick={() => onToggleRating(r)} />
            ))}
          </div>
        </div>
      )}

      <div className="filter-group">
        <h2>Release Years</h2>
        <div className="year-range">
          <input type="number" value={yearFrom} onChange={(e) => onYearFrom(e.target.value)} aria-label="From year" />
          <span className="year-range__dash">–</span>
          <input type="number" value={yearTo} onChange={(e) => onYearTo(e.target.value)} aria-label="To year" />
        </div>
      </div>
    </section>
  );
}
