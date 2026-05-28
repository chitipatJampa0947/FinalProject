export type ReportStatus = 'pending' | 'approved' | 'rejected';

export interface Report {
  id: string;
  text: string;
  predictedClass: string;
  actualClass: string;
  aiPercentage: number;
  createdAt: string;
  status: ReportStatus;
}

const STORAGE_KEY = 'ai-detector-reports-v1';
const EVENT = 'ai-detector-reports-changed';

function read(): Report[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Report[]) : [];
  } catch {
    return [];
  }
}

function write(reports: Report[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function listReports(): Report[] {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addReport(input: Omit<Report, 'id' | 'createdAt' | 'status'>): Report {
  const report: Report = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const next = [report, ...read()];
  write(next);
  return report;
}

export function updateStatus(id: string, status: ReportStatus): void {
  const next = read().map((r) => (r.id === id ? { ...r, status } : r));
  write(next);
}

export function deleteReport(id: string): void {
  write(read().filter((r) => r.id !== id));
}

export function clearReports(): void {
  write([]);
}

export function subscribe(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
