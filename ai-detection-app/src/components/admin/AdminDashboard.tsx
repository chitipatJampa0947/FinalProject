import React, { useEffect, useMemo, useState } from 'react';
import {
  type Report,
  type ReportStatus,
  clearReports,
  deleteReport,
  listReports,
  subscribe,
  updateStatus,
} from '../../services/reportStore';

type Filter = 'all' | ReportStatus;

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
  const [reports, setReports] = useState<Report[]>(() => listReports());
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribe(() => setReports(listReports()));
    return unsub;
  }, []);

  const counts = useMemo(() => {
    const c = { all: reports.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of reports) c[r.status] += 1;
    return c;
  }, [reports]);

  const visible = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  const handleApprove = (id: string) => updateStatus(id, 'approved');
  const handleReject = (id: string) => updateStatus(id, 'rejected');
  const handleDelete = (id: string) => deleteReport(id);
  const handleClearAll = () => {
    if (confirm('Clear all reports from local storage?')) clearReports();
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body">
      <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary scale-110">admin_panel_settings</span>
            <div>
              <h1 className="font-headline font-bold tracking-tight text-xl">Admin Dashboard</h1>
              <p className="text-[10px] uppercase font-label tracking-widest text-outline">Mock review queue · LocalStorage</p>
            </div>
          </div>
          <button
            onClick={onExit}
            className="px-5 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-bold text-xs hover:bg-surface-container-highest transition-all uppercase font-label flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back to App
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
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
            {reports.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs font-label uppercase tracking-widest text-tertiary hover:underline"
              >
                Clear All
              </button>
            )}
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
                return (
                  <li key={r.id} className="bg-surface-container rounded-2xl p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold font-label uppercase tracking-widest ${statusBadge[r.status]}`}>
                          {statusLabel[r.status]}
                        </span>
                        <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                          Predicted: <strong className="text-on-surface-variant">{r.predictedClass}</strong>
                        </span>
                        <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                          User says: <strong className="text-on-surface-variant">{r.actualClass}</strong>
                        </span>
                        <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                          AI %: <strong className="text-on-surface-variant tabular-nums">{Math.round(r.aiPercentage)}%</strong>
                        </span>
                      </div>
                      <span className="text-[10px] font-label uppercase tracking-widest text-outline">
                        {formatDate(r.createdAt)}
                      </span>
                    </div>

                    <p className={`text-sm thai-leading text-on-surface ${expanded ? '' : 'line-clamp-3'}`}>
                      {r.text}
                    </p>
                    {r.text.length > 200 && (
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
                        className="px-5 py-2.5 rounded-xl bg-secondary text-white font-bold text-xs hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all uppercase font-label flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={r.status === 'rejected'}
                        className="px-5 py-2.5 rounded-xl bg-tertiary text-white font-bold text-xs hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all uppercase font-label flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">cancel</span>
                        Reject
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
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
