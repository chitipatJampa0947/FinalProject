import React from 'react';

const MIN_CHARS = 200;
const OPTIMAL_MAX = 3000;
const MAX_CHARS = 10000;
const HARD_CAP = 10500; // textarea maxLength: allow slight overshoot so user sees the error

interface TextInputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  isAnalyzing?: boolean;
  disabled?: boolean;
}

export const TextInputBox: React.FC<TextInputBoxProps> = ({
  value,
  onChange,
  onAnalyze,
  isAnalyzing = false,
  disabled = false,
}) => {
  const length = value.length;

  const isEmpty = length === 0;
  const isTooShort = !isEmpty && length < MIN_CHARS;
  const isOverOptimal = length > OPTIMAL_MAX && length <= MAX_CHARS;
  const isOverLimit = length > MAX_CHARS;
  const isValid = length >= MIN_CHARS && length <= MAX_CHARS;
  const canAnalyze = isValid && !isAnalyzing && !disabled;

  let counterColor = 'text-outline';
  if (isOverLimit) counterColor = 'text-error font-bold';
  else if (isOverOptimal) counterColor = 'text-amber-500';
  else if (isValid) counterColor = 'text-emerald-500';

  const textareaBorder = isOverLimit
    ? 'border-2 border-error focus:ring-error/40'
    : 'border border-transparent focus:ring-primary/30';

  return (
    <div className="w-full space-y-3">
      <textarea
        className={`w-full min-h-[260px] p-5 rounded-2xl bg-surface-container-low text-on-surface placeholder:text-outline-variant text-lg thai-leading resize-none outline-none focus:ring-4 transition-all ${textareaBorder}`}
        placeholder="วางข้อความภาษาไทยที่ต้องการตรวจสอบที่นี่... / Paste Thai text to analyze..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={HARD_CAP}
        disabled={disabled}
      />

      <div className="flex items-start justify-between gap-4 px-1">
        <div className="text-sm thai-leading min-h-[1.25rem]">
          {isTooShort && (
            <span className="text-error font-medium">
              ข้อความสั้นเกินไป ต้องการอย่างน้อย {MIN_CHARS} ตัวอักษร — Text too short, minimum {MIN_CHARS} characters required.
            </span>
          )}
          {isOverOptimal && (
            <span className="text-amber-500 font-medium">
              💡 ความยาวเกิน 3,000 ตัวอักษร: ระบบจะวิเคราะห์จากช่วงต้นของข้อความเป็นหลัก (ประมาณ 416 โทเคนแรก) — Long text detected: Analysis focuses on the beginning of the text (about the first 416 tokens).
            </span>
          )}
          {isOverLimit && (
            <span className="text-error font-bold">
              เกินขีดจำกัดการทดสอบ ({MAX_CHARS} ตัวอักษร) — Exceeds test limit of {MAX_CHARS} characters.
            </span>
          )}
        </div>

        <div className={`text-sm font-mono tabular-nums whitespace-nowrap ${counterColor}`}>
          {length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!canAnalyze}
          aria-busy={isAnalyzing}
          aria-label={isAnalyzing ? 'Analyzing' : 'Analyze Text'}
          className={`px-10 py-4 rounded-xl font-bold uppercase font-label tracking-wide flex items-center justify-center gap-2 min-w-[200px] transition-all ${
            canAnalyze
              ? 'signature-gradient text-white shadow-xl shadow-primary/20 hover:opacity-90 active:scale-[0.98]'
              : 'bg-surface-container-high text-outline cursor-not-allowed'
          }`}
        >
          {isAnalyzing ? (
            <svg
              className="w-6 h-6 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <span>Analyze / วิเคราะห์</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default TextInputBox;
