import React from 'react';

type Category = 'human' | 'gpt' | 'gemini' | 'other';

interface DetectionResultProps {
  category: Category;
  probs: { human: number; gpt: number; gemini: number; other: number };
  aiPercentage: number; // 0-100, total AI likelihood = (1 - P_human) * 100
  onReportIncorrect: () => void;
}

interface CategoryMeta {
  labelEn: string;
  labelTh: string;
  icon: string;
  badge: string; // badge background + text (light + dark)
  gradFrom: string; // gauge gradient start (hex)
  gradTo: string; // gauge gradient end (hex)
  copy: string; // Thai explanation under the gauge
  centerLabel: string; // small label under the % in the gauge
}

const CATEGORY_META: Record<Category, CategoryMeta> = {
  human: {
    labelEn: 'Human Written',
    labelTh: 'ฝีมือมนุษย์',
    icon: 'person',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    gradFrom: '#10b981',
    gradTo: '#059669',
    copy: 'มีแนวโน้มสูงว่าข้อความนี้ถูกเขียนโดยมนุษย์',
    centerLabel: 'Human Conf.',
  },
  gpt: {
    labelEn: 'ChatGPT-Generated',
    labelTh: 'สร้างโดย ChatGPT',
    icon: 'smart_toy',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    gradFrom: '#14b8a6',
    gradTo: '#0d9488',
    copy: 'มีแนวโน้มว่าข้อความนี้ถูกสร้างโดยโมเดลตระกูล ChatGPT (GPT-4o-mini)',
    centerLabel: 'GPT Conf.',
  },
  gemini: {
    labelEn: 'Gemini-Generated',
    labelTh: 'สร้างโดย Gemini',
    icon: 'auto_awesome',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    gradFrom: '#8b5cf6',
    gradTo: '#7c3aed',
    copy: 'มีแนวโน้มว่าข้อความนี้ถูกสร้างโดยโมเดล Gemini (2.5 Flash-Lite)',
    centerLabel: 'Gemini Conf.',
  },
  other: {
    labelEn: 'Other AI-Generated',
    labelTh: 'สร้างโดย AI ค่ายอื่นๆ',
    icon: 'device_unknown',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    gradFrom: '#f59e0b',
    gradTo: '#d97706',
    copy: 'ตรวจพบว่าเป็นข้อความจาก AI แต่ไม่สามารถระบุค่ายได้ชัดเจน อาจมาจาก AI ค่ายอื่น',
    centerLabel: 'AI Likelihood',
  },
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const DetectionResult: React.FC<DetectionResultProps> = ({
  category,
  probs,
  onReportIncorrect,
}) => {
  const meta = CATEGORY_META[category];

  const human = clamp01(probs.human);
  const gpt = clamp01(probs.gpt);
  const gemini = clamp01(probs.gemini);
  const other = clamp01(probs.other);

  // Gauge shows the confidence behind the chosen verdict (the winning class's
  // own probability). 'other' is a real trained class now, so it uses its prob.
  const confidence =
    category === 'human'
      ? human
      : category === 'gpt'
      ? gpt
      : category === 'gemini'
      ? gemini
      : other;
  const pct = Math.round(confidence * 100);

  const radius = 72;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const gradId = `gauge-grad-${category}`;

  // Full per-class distribution, always shown for transparency.
  const breakdown: { key: Category; label: string; value: number; bar: string }[] = [
    { key: 'human', label: 'Human / มนุษย์', value: human, bar: 'bg-emerald-500' },
    { key: 'gpt', label: 'ChatGPT', value: gpt, bar: 'bg-teal-500' },
    { key: 'gemini', label: 'Gemini', value: gemini, bar: 'bg-violet-500' },
    { key: 'other', label: 'Other AI / AI อื่นๆ', value: other, bar: 'bg-amber-500' },
  ];
  // Highlight the single highest-probability class.
  const topKey = breakdown.reduce((a, b) => (b.value > a.value ? b : a)).key;

  return (
    <div className="bg-surface-container-highest rounded-2xl p-10 space-y-8 transition-all duration-500 shadow-sm">
      <div className="flex justify-between items-start">
        <span className="text-xs font-label tracking-widest text-outline uppercase font-bold">
          Forensic Result
        </span>
        <div
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold font-label uppercase ${meta.badge}`}
        >
          <span className="material-symbols-outlined text-sm leading-none">{meta.icon}</span>
          {meta.labelEn}
        </div>
      </div>

      <div className="flex flex-col items-center space-y-5">
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
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={meta.gradFrom} />
                <stop offset="100%" stopColor={meta.gradTo} />
              </linearGradient>
            </defs>
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke={`url(#${gradId})`}
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
            <span className="text-[10px] font-label uppercase tracking-widest text-outline mt-1">
              {meta.centerLabel}
            </span>
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-lg font-bold text-on-surface font-headline thai-leading">
            {meta.labelTh}
          </p>
          <p className="text-sm font-medium text-on-surface-variant thai-leading max-w-[280px] mx-auto">
            {meta.copy}
          </p>
        </div>
      </div>

      {/* Per-class probability breakdown */}
      <div className="space-y-3 pt-1">
        <div className="text-[10px] font-label uppercase tracking-widest text-outline">
          Class Probabilities
        </div>
        {breakdown.map((b) => {
          const w = Math.round(b.value * 100);
          const isTop = b.key === topKey;
          return (
            <div key={b.key} className="space-y-1">
              <div className="flex justify-between items-center text-xs font-label">
                <span
                  className={`thai-leading ${
                    isTop ? 'font-bold text-on-surface' : 'text-on-surface-variant'
                  }`}
                >
                  {b.label}
                </span>
                <span
                  className={`tabular-nums ${
                    isTop ? 'font-bold text-on-surface' : 'text-on-surface-variant'
                  }`}
                >
                  {w}%
                </span>
              </div>
              <div className="relative w-full h-2 bg-surface-container rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${b.bar} rounded-full ${
                    isTop ? '' : 'opacity-50'
                  }`}
                  style={{ width: `${w}%`, transition: 'width 1s ease-out' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2">
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
