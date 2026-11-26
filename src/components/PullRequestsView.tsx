import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, GitPullRequest, RefreshCw, Search } from 'lucide-react';

type PullRequest = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  html_url: string;
  updated_at: string;
  created_at: string;
  merged_at: string | null;
  head: { ref: string };
  base: { ref: string };
  user?: { login?: string };
};

type FilterState = 'open' | 'closed' | 'all';

const REPOSITORY = 'vutting895/VOOM_SYSTEM-NOVA-AI';
const PAGE_SIZE = 100;

function statusLabel(pr: PullRequest) {
  if (pr.merged_at) return 'MERGED';
  if (pr.state === 'open' && pr.draft) return 'DRAFT';
  return pr.state.toUpperCase();
}

function statusClass(pr: PullRequest) {
  if (pr.merged_at) return 'border-violet-400/30 bg-violet-500/10 text-violet-300';
  if (pr.state === 'open' && pr.draft) return 'border-amber-400/30 bg-amber-500/10 text-amber-300';
  if (pr.state === 'open') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
}

export default function PullRequestsView() {
  const [filter, setFilter] = useState<FilterState>('open');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PullRequest[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadPage = useCallback(async (pageToLoad: number, replace = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPOSITORY}/pulls?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE}&page=${pageToLoad}`,
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (!response.ok) {
        throw new Error(response.status === 403 || response.status === 429
          ? 'GitHub API rate limit reached. Open the live PR list on GitHub or retry later.'
          : `GitHub API returned HTTP ${response.status}.`);
      }
      const batch = (await response.json()) as PullRequest[];
      setItems((previous) => {
        const merged = replace ? batch : [...previous, ...batch];
        const unique = new Map<number, PullRequest>();
        merged.forEach((item) => unique.set(item.number, item));
        return Array.from(unique.values()).sort(
          (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
        );
      });
      setPage(pageToLoad);
      setHasMore(batch.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load pull requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((pr) => {
      const matchesState = filter === 'all'
        || (filter === 'open' && pr.state === 'open')
        || (filter === 'closed' && pr.state === 'closed');
      const matchesQuery = !normalized
        || `#${pr.number} ${pr.title} ${pr.head.ref} ${pr.base.ref} ${pr.user?.login ?? ''}`.toLowerCase().includes(normalized);
      return matchesState && matchesQuery;
    });
  }, [filter, items, query]);

  const counts = useMemo(() => ({
    open: items.filter((pr) => pr.state === 'open').length,
    closed: items.filter((pr) => pr.state === 'closed').length,
    merged: items.filter((pr) => Boolean(pr.merged_at)).length,
  }), [items]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <GitPullRequest className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">NOVA Engineering</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-white">Pull Request Center</h1>
          <p className="mt-1 text-sm text-slate-400">
            รวม PR จาก GitHub repository เดียวกัน แสดงสถานะ Draft, Open, Closed และ Merged จากข้อมูลต้นทาง
          </p>
        </div>
        <a
          href={`https://github.com/${REPOSITORY}/pulls`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
        >
          เปิด PR บน GitHub <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-slate-400">Loaded PRs</div>
          <div className="mt-1 text-2xl font-bold text-white">{items.length}</div>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4">
          <div className="text-xs text-emerald-300">Open</div>
          <div className="mt-1 text-2xl font-bold text-white">{counts.open}</div>
        </div>
        <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.05] p-4">
          <div className="text-xs text-violet-300">Merged</div>
          <div className="mt-1 text-2xl font-bold text-white">{counts.merged}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-slate-400">Closed (not merged)</div>
          <div className="mt-1 text-2xl font-bold text-white">{Math.max(0, counts.closed - counts.merged)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0B0C14]/80 p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['open', 'closed', 'all'] as FilterState[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${filter === value ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-400 hover:text-white'}`}
            >
              {value === 'open' ? 'Open' : value === 'closed' ? 'Closed' : 'All'}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-2 md:max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาเลข PR, ชื่อ, branch..."
              className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadPage(1, true)}
            disabled={loading}
            aria-label="Refresh pull requests"
            className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {error} <a className="underline" href={`https://github.com/${REPOSITORY}/pulls`} target="_blank" rel="noreferrer">ดูรายการล่าสุดบน GitHub</a>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-sm font-semibold text-white">Pull Requests</span>
          <span className="text-xs text-slate-500">{visibleItems.length} รายการที่ตรงกับตัวกรอง</span>
        </div>
        {visibleItems.length === 0 && !loading ? (
          <div className="p-8 text-center text-sm text-slate-500">ไม่พบ PR ตามเงื่อนไข</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {visibleItems.map((pr) => (
              <article key={pr.number} className="flex flex-col gap-3 p-4 transition-colors hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">#{pr.number}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${statusClass(pr)}`}>
                      {statusLabel(pr)}
                    </span>
                    <span className="text-[11px] text-slate-500">{new Date(pr.updated_at).toLocaleString()}</span>
                  </div>
                  <h2 className="mt-1 truncate text-sm font-semibold text-slate-100">{pr.title}</h2>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
                    {pr.head.ref} <span className="text-slate-600">→</span> {pr.base.ref}
                  </p>
                </div>
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                >
                  เปิด PR <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          แสดงข้อมูลจาก GitHub API โดยตรง · โหลดครั้งละ {PAGE_SIZE} PR · ไม่แก้ไขหรือเปลี่ยนสถานะ PR
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => void loadPage(page + 1)}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? 'กำลังโหลด…' : 'โหลด PR เพิ่ม'}
          </button>
        )}
      </div>
    </section>
  );
}
