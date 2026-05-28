import React from 'react';

interface DetectionResultProps {
  aiPercentage: number;
  onReportIncorrect: () => void;
}

const verdictFor = (pct: number): { label: string; tone: 'ai' | 'mixed' | 'human'; copy: string } => {
  if (pct >= 70) return {
    label: 'LIKELY AI',
    tone: 'ai',
    copy: 'มีแนวโน้มสูงว่าข้อความนี้ถูกสร้างโดยปัญญาประดิษฐ์',
  };
  if (pct >= 40) return {
    label: 'UNCERTAIN',
    tone: 'mixed',
    copy: 'ผลการวิเคราะห์ก้ำกึ่ง อาจมีทั้งส่วนที่มนุษย์เขียนและ AI ช่วยร่าง',
  };
  return {
    label: 'LIKELY HUMAN',
    tone: 'human',
    copy: 'มีแนวโน้มสูงว่าข้อความนี้ถูกเขียนโดยมนุษย์',
  };
};

export const DetectionResult: React.FC<DetectionResultProps> = ({ aiPercentage, onReportIncorrect }) => {
  const pct = Math.max(0, Math.min(100, Math.round(aiPercentage)));
  const verdict = verdictFor(pct);

  const badgeClass =
    verdict.tone === 'ai'
      ? 'bg-tertiary-container text-tertiary'
      : verdict.tone === 'human'
      ? 'bg-secondary-container text-on-secondary-container'
      : 'bg-surface-container-high text-on-surface-variant';

  const radius = 72;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div className="bg-surface-container-highest rounded-2xl p-10 space-y-10 transition-all duration-500 shadow-sm">
      <div className="flex justify-between items-start">
        <span className="text-xs font-label tracking-widest text-outline uppercase font-bold">Forensic Result</span>
        <div className={`px-4 py-1.5 rounded-full text-xs font-bold font-label uppercase ${badgeClass}`}>
          {verdict.label}
        </div>
      </div>

      <div className="flex flex-col items-center space-y-6">
        <div className="relative w-[180px] h-[180px]">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 180 180">
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              className="stroke-surface-container"
              strokeWidth={stroke}
            />
            <defs>
              <linearGradient id="ai-gauge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3525cd" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
            </defs>
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke="url(#ai-gauge-grad)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1s ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-black text-on-surface tracking-tighter font-headline leading-none">
              {pct}%
            </span>
            <span className="text-[10px] font-label uppercase tracking-widest text-outline mt-1">AI Likelihood</span>
          </div>
        </div>

        <p className="text-base font-medium text-on-surface-variant thai-leading text-center max-w-[280px]">
          โอกาสที่จะเป็นข้อความจาก AI: <span className="font-bold text-on-surface">{pct}%</span>
          <br />
          {verdict.copy}
        </p>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex justify-between text-[10px] font-label uppercase tracking-widest text-outline">
          <span>Human</span>
          <span>AI</span>
        </div>
        <div className="relative w-full h-3 bg-surface-container rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 signature-gradient rounded-full"
            style={{ width: `${pct}%`, transition: 'width 1s ease-out' }}
          />
        </div>
      </div>

      <div className="pt-4">
        <button
          className="w-full py-5 text-tertiary bg-tertiary/5 rounded-xl font-bold text-sm hover:bg-tertiary/10 transition-all flex items-center justify-center gap-3 font-label uppercase"
          onClick={onReportIncorrect}
        >
          <span className="material-symbols-outlined scale-110">report</span>
          Report Incorrect Result
        </button>
      </div>
    </div>
  );
};
