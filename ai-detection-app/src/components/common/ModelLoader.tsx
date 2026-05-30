import React from 'react';

interface ModelLoaderProps {
  status: string;
  percentage: number | null;
  icon?: string;
}

export const ModelLoader: React.FC<ModelLoaderProps> = ({ status, percentage, icon = 'downloading' }) => {
  const hasPct = typeof percentage === 'number';
  const pct = hasPct ? Math.max(0, Math.min(100, percentage!)) : null;

  return (
    <div className="bg-surface-container-low rounded-2xl px-6 py-5 space-y-3 transition-colors duration-300">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-primary animate-pulse">{icon}</span>
          <span className="text-sm thai-leading text-on-surface-variant font-medium truncate">
            {status || 'กำลังเตรียมโมเดล...'}
          </span>
        </div>
        {hasPct && (
          <span className="text-primary font-bold text-sm font-label tabular-nums">{pct}%</span>
        )}
      </div>

      <div className="relative w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
        {hasPct ? (
          <div
            className="h-full signature-gradient rounded-full"
            style={{ width: `${pct}%`, transition: 'width 300ms ease-out' }}
          />
        ) : (
          <div className="absolute inset-y-0 w-1/3 signature-gradient rounded-full animate-[indeterminate_1.4s_ease-in-out_infinite]" />
        )}
      </div>
    </div>
  );
};
