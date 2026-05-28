import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type ReportStatus = 'pending' | 'approved' | 'rejected';
type Filter = 'all' | ReportStatus;

interface ReportRow {
  id: string;
  reported_text: string;
  ai_probability: number;
  user_expected_label: string;
  status: ReportStatus;
  created_at: string;
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
    const { data, error } = await supabase
      .from('user_reports')
      .select('id, reported_text, ai_probability, user_expected_label, status, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Supabase fetch failed:', error);
      setError(error.message);
    } else {
      setReports((data ?? []) as ReportRow[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const counts = useMemo(() => {
    const c = { all: reports.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of reports) c[r.status] += 1;
    return c;
  }, [reports]);

  const visible = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  const updateRowStatus = async (id: string, status: ReportStatus) => {
    const { error } = await supabase.from('user_reports').update({ status }).eq('id', id);
    if (error) {
      console.error('Supabase update failed:', error);
      setError(error.message);
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const handleApprove = (id: string) => void updateRowStatus(id, 'approved');
  const handleReject = (id: string) => void updateRowStatus(id, 'rejected');

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this report from Supabase? This cannot be undone.')) return;
    const { error } = await supabase.from('user_reports').delete().eq('id', id);
    if (error) {
      console.error('Supabase delete failed:', error);
      setError(error.message);
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body">
      <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary scale-110">admin_panel_settings</span>
            <div>
              <h1 className="font-headline font-bold tracking-tight text-xl">Admin Dashboard</h1>
              <p className="text-[10px] uppercase font-label tracking-widest text-outline">Supabase · user_reports</p>
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
                const predicted = r.ai_probability >= 50 ? 'AI' : 'Human';
                return (
                  <li key={r.id} className="bg-surface-container rounded-2xl p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
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
