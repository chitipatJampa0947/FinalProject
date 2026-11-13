import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminClient } from '../../lib/supabaseClient';
import { requireAdministrator } from '../../security/adminAuthorization';

type ReportStatus = 'pending' | 'approved' | 'rejected';
type Filter = 'all' | ReportStatus;

interface ReportRow {
  id: string;
  reported_text: string;
  ai_probability: number;
  user_expected_label: string;
  status: ReportStatus;
  created_at: string;
  model_category: 'human' | 'gpt' | 'gemini' | 'other' | null;
}

const statusBadge: Record<ReportStatus, string> = {
  pending: 'bg-surface-container-high text-on-surface-variant',
  approved: 'bg-secondary-container text-on-secondary-container',
  rejected: 'bg-tertiary-container text-tertiary',
};

const statusLabel: Record<ReportStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// High-priority / suspicious: model very confident but user disagrees.
// ai_probability is stored 0–100 (percent), so thresholds are 80 / 20.
const isHighPriority = (r: ReportRow): boolean =>
  (r.ai_probability > 80 && r.user_expected_label === 'Human') ||
  (r.ai_probability < 20 && r.user_expected_label === 'AI-Generated');

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const AdminDashboard: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
    const supabase = await getAdminClient();
    await requireAdministrator(supabase);
    const { data, error } = await supabase
      .from('user_reports')
      .select('id, reported_text, ai_probability, user_expected_label, status, created_at, model_category')
      .order('created_at', { ascending: false }).limit(100);
    if (error) {
      throw new Error('Reports could not be loaded. Verify your administrator session.');
    } else {
      setReports((data ?? []) as ReportRow[]);
    }
    } catch (error) { setReports([]); setError(error instanceof Error ? error.message : 'Reports unavailable.'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    // Initial data load on mount. fetchReports flips isLoading synchronously
    // so the spinner renders before the network round-trip — intentional for
    // a fetch-on-mount admin view; the cascading-render concern doesn't apply.
    void fetchReports();
  }, [fetchReports]);

  const counts = useMemo(() => {
    const c = { all: reports.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of reports) if (['pending', 'approved', 'rejected'].includes(r.status)) c[r.status] += 1;
    return c;
  }, [reports]);

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);
  // Float high-priority reports to the top; reports already arrive created_at
  // desc, and Array.prototype.sort is stable so that ordering is preserved
  // within each priority group.
  const visible = [...filtered].sort(
    (a, b) => Number(isHighPriority(b)) - Number(isHighPriority(a))
  );

  const updateRowStatus = async (id: string, status: ReportStatus) => {
    try {
    const supabase = await getAdminClient(); await requireAdministrator(supabase);
    const { data, error } = await supabase.from('user_reports').update({ status }).eq('id', id).select('id').maybeSingle();
    if (error || !data) throw new Error('Status was not changed. Access may have expired.');
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (error) { setReports([]); setError(error instanceof Error ? error.message : 'Update failed.'); }
  };

  const handleApprove = (id: string) => void updateRowStatus(id, 'approved');
  const handleReject = (id: string) => void updateRowStatus(id, 'rejected');

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this report from Supabase? This cannot be undone.')) return;
    try {
    const supabase = await getAdminClient(); await requireAdministrator(supabase);
    const { data, error } = await supabase.from('user_reports').delete().eq('id', id).select('id').maybeSingle();
    if (error || !data) throw new Error('Report was not deleted. Access may have expired.');
    setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (error) { setReports([]); setError(error instanceof Error ? error.message : 'Delete failed.'); }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body">
      <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary scale-110">admin_panel_settings</span>
            <div>
              <h1 className="font-headline font-bold tracking-tight text-xl">Admin Dashboard</h1>
              <p className="text-[10px] uppercase font-label tracking-widest text-outline">Latest 100 reports · administrator access required</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchReports()}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-bold text-xs hover:bg-surface-container-highest disabled:opacity-50 transition-all uppercase font-label flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={onExit}
              className="px-5 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-bold text-xs hover:bg-surface-container-highest transition-all uppercase font-label flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to App
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {error && (
          <div className="bg-tertiary-container text-tertiary rounded-2xl p-4 text-sm">
            Supabase error: {error}
          </div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['all', 'pending', 'approved', 'rejected'] as Filter[]).map((key) => {
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-2xl p-5 text-left transition-all ${
                  active ? 'bg-surface-container-highest shadow-sm' : 'bg-surface-container-low hover:bg-surface-container'
                }`}
              >
                <div className="text-[10px] font-label uppercase tracking-widest text-outline">{key}</div>
                <div className={`text-3xl font-black font-headline mt-2 ${active ? 'text-primary' : 'text-on-surface'}`}>
                  {counts[key]}
                </div>
              </button>
            );
          })}
        </section>

        <section className="bg-surface-container-low rounded-2xl p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-headline font-bold text-2xl tracking-tight">
              Reported Texts <span className="text-outline font-medium text-lg">({visible.length})</span>
            </h2>
          </div>

          {visible.length === 0 ? (
            <div className="bg-surface-container rounded-2xl p-12 flex flex-col items-center text-center gap-4">
              <span className="material-symbols-outlined text-5xl text-outline">inbox</span>
              <p className="text-on-surface-variant thai-leading">
                ยังไม่มีรายงานในคิวนี้ <br />
                <span className="text-xs uppercase font-label tracking-widest text-outline">No reports in this view</span>
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {visible.map((r) => {
                const expanded = expandedId === r.id;
                // Total AI probability is not the four-class argmax verdict.
                const predicted = r.model_category
                  ? ({ human: 'Human', gpt: 'GPT', gemini: 'Gemini', other: 'Other' }[r.model_category] ?? 'Invalid / unverified')
                  : 'Legacy / not recorded';
                const highPriority = isHighPriority(r);
                return (
                  <li
                    key={r.id}
                    className={`rounded-2xl p-6 space-y-4 ${
                      highPriority
                        ? 'bg-rose-50 dark:bg-rose-950/40 ring-2 ring-rose-400 dark:ring-rose-500/60'
                        : 'bg-surface-container'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        {highPriority && (
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold font-label uppercase tracking-widest bg-rose-600 text-white flex items-center gap-1">
                            ⚠️ High Priority
                          </span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold font-label uppercase tracking-widest ${statusBadge[r.status]}`}>
                          {statusLabel[r.status]}
                        </span>
                        <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                          Predicted: <strong className="text-on-surface-variant">{predicted}</strong>
                        </span>
                        <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                          User says: <strong className="text-on-surface-variant">{r.user_expected_label}</strong>
                        </span>
                        <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                          AI %: <strong className="text-on-surface-variant tabular-nums">{Math.round(r.ai_probability)}%</strong>
                        </span>
                      </div>
                      <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                        {formatDate(r.created_at)}
                      </span>
                    </div>

                    <p className={`text-sm thai-leading text-on-surface ${expanded ? '' : 'line-clamp-3'}`}>
                      {r.reported_text}
                    </p>
                    {r.reported_text.length > 200 && (
                      <button
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                        className="text-xs font-label uppercase tracking-widest text-primary hover:underline"
                      >
                        {expanded ? 'Collapse' : 'Expand'}
                      </button>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={() => handleApprove(r.id)}
                        disabled={r.status === 'approved'}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all uppercase font-label flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={r.status === 'rejected'}
                        className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all uppercase font-label flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">cancel</span>
                        Reject
                      </button>
                      <button
                        onClick={() => void handleDelete(r.id)}
                        className="px-5 py-2.5 rounded-xl bg-surface-container-high text-on-surface-variant font-bold text-xs hover:bg-surface-container-highest transition-all uppercase font-label flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};
