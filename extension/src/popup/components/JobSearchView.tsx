/**
 * Job Search tab. Self-contained: owns its own query / loading / results /
 * error state (the resume flow's zustand store + bottom StatusBar are
 * untouched). The actual search is proxied to the backend through the
 * `useJobSearch` hook → background worker → `POST /api/job-search`, which
 * runs Google Custom Search and appends the hits to the shared Google Sheet.
 */
import { useCallback, useState, type FC } from 'react';
import type { AppError, JobSearchResult } from '@/types/messages';
import { useJobSearch } from '../hooks/useJobSearch';
import { PrimaryButton, toast } from './ui';

/** Seed query — mirrors the CLI runner's DEFAULT_QUERY. */
export const DEFAULT_JOB_SEARCH_QUERY =
  'site:jobs.ashbyhq.com remote jobs in US for Full stack developer';

interface SearchOutcome {
  jobs: JobSearchResult[];
  saved: number;
  sheetUrl: string | null;
}

const SearchIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const ExternalLinkIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

/** True when the failure is Google rejecting the project (the 403 we hit). */
function looksApiDisabled(error: AppError): boolean {
  return /403|custom search|does not have the access/i.test(error.message);
}

const ErrorCard: FC<{ error: AppError }> = ({ error }) => {
  let hint: string | null = null;
  if (looksApiDisabled(error)) {
    hint =
      "The backend's Google project can't reach the Custom Search JSON API yet. Enable “Custom Search API” for that project in Google Cloud Console, then retry.";
  } else if (error.code === 'BACKEND_UNREACHABLE') {
    hint =
      'Could not reach the backend. Start it locally (npm --workspace backend run dev) and make sure the extension is pointed at that URL.';
  } else if (error.code === 'UNAUTHORIZED') {
    hint = 'The backend rejected the request (auth). Check the backend URL and token in Settings.';
  }
  return (
    <div className="border-b border-rose-200 bg-rose-50 px-4 py-3">
      <p className="text-xs font-semibold text-rose-800">Search failed</p>
      <p className="mt-1 break-words text-[11px] text-rose-700">{error.message}</p>
      {hint && <p className="mt-1.5 text-[11px] text-rose-600/90">{hint}</p>}
    </div>
  );
};

const Results: FC<{ outcome: SearchOutcome }> = ({ outcome }) => {
  if (outcome.jobs.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-slate-500">
        No results. Try a different query, or confirm the search engine is set to
        “Search the entire web”.
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
        <span>
          {outcome.saved > 0
            ? `Appended ${outcome.saved} row${outcome.saved === 1 ? '' : 's'} to the sheet`
            : `Found ${outcome.jobs.length} result${outcome.jobs.length === 1 ? '' : 's'}`}
        </span>
        {outcome.sheetUrl && (
          <a
            href={outcome.sheetUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-emerald-700 underline-offset-2 hover:underline"
          >
            Open sheet
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {outcome.jobs.map((job, i) => (
          <li key={`${job.link}-${i}`} className="px-4 py-3">
            <a
              href={job.link}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              {job.title || job.link}
            </a>
            {job.snippet && (
              <p className="mt-1 break-words text-[11px] leading-relaxed text-slate-500">
                {job.snippet}
              </p>
            )}
            <p className="mt-1 truncate text-[10px] text-slate-400">{job.link}</p>
          </li>
        ))}
      </ul>
    </>
  );
};

export const JobSearchView: FC = () => {
  const search = useJobSearch();
  const [query, setQuery] = useState(DEFAULT_JOB_SEARCH_QUERY);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const onRun = useCallback(async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    const res = await search(q);
    if (res.ok) {
      setOutcome(res.data);
      toast.success(
        res.data.saved > 0
          ? `Saved ${res.data.saved} job${res.data.saved === 1 ? '' : 's'} to the sheet`
          : 'Search ran — nothing to save',
      );
    } else {
      setError(res.error);
      toast.error(res.error.message);
    }
    setBusy(false);
  }, [query, busy, search]);

  return (
    <div className="bg-white">
      <section className="border-b border-slate-200 p-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-sm ring-1 ring-inset ring-slate-900/20">
            <SearchIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">Job Search</h2>
            <p className="text-[11px] text-slate-500">
              Google Custom Search → appended to your Google Sheet.
            </p>
          </div>
        </div>

        <label htmlFor="job-search-query" className="mt-3 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Query — supports site:, intitle:, quotes, OR
        </label>
        <textarea
          id="job-search-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void onRun();
            }
          }}
          rows={3}
          disabled={busy}
          spellCheck={false}
          className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-700 shadow-sm transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="e.g. site:jobs.lever.co react remote US"
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">⌘/Ctrl + Enter to run</span>
          <PrimaryButton
            onClick={() => void onRun()}
            disabled={!query.trim()}
            loading={busy}
            leadingIcon={<SearchIcon className="h-3 w-3" />}
          >
            {busy ? 'Searching…' : 'Run search'}
          </PrimaryButton>
        </div>
      </section>

      {error && <ErrorCard error={error} />}
      {outcome && <Results outcome={outcome} />}
    </div>
  );
};
