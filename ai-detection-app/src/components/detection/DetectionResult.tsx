import React from 'react';

interface DetectionResultProps {
  result: string;
  percentage: number;
  onReportIncorrect: () => void;
}

export const DetectionResult: React.FC<DetectionResultProps> = ({ result, percentage, onReportIncorrect }) => {
  const isAI = result.toUpperCase() === 'AI';

  return (
    <div className="bg-surface-container-highest rounded-[2rem] p-8 space-y-8 sticky top-28">
      <div className="flex justify-between items-start">
        <span className="text-xs font-label tracking-widest text-outline uppercase font-bold">Forensic Result</span>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
          isAI ? 'bg-tertiary-container text-tertiary' : 'bg-secondary-container text-on-secondary-container'
        }`}>
          {isAI ? 'AI DETECTED' : 'HUMAN VERIFIED'}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-7xl font-black text-on-surface tracking-tighter">{percentage}%</div>
        <div className="text-sm font-medium text-on-surface-variant thai-leading">
          {isAI 
            ? 'ความน่าจะเป็นที่ข้อความนี้ถูกสร้างโดยปัญญาประดิษฐ์' 
            : 'ความน่าจะเป็นที่ข้อความนี้ถูกสร้างโดยมนุษย์'}
        </div>
      </div>

      <div className="w-full bg-surface-container rounded-full h-4 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${isAI ? 'bg-tertiary' : 'bg-secondary'}`} 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      <div className="space-y-4 pt-4">
        {isAI ? (
          <>
            <div className="flex items-center gap-3 text-sm font-medium text-on-surface">
              <span className="material-symbols-outlined text-tertiary">warning</span>
              <span>Unnatural syntactic patterns detected</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-on-surface">
              <span className="material-symbols-outlined text-tertiary">fingerprint</span>
              <span>Repetitive linguistic tokens found</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm font-medium text-on-surface">
              <span className="material-symbols-outlined text-secondary">verified</span>
              <span>Organic linguistic flow detected</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-on-surface">
              <span className="material-symbols-outlined text-secondary">auto_awesome</span>
              <span>Natural variation in sentence structure</span>
            </div>
          </>
        )}
      </div>

      <div className="pt-6 border-t border-outline-variant/20">
        <button 
          className="w-full py-4 text-tertiary border border-tertiary/20 rounded-xl font-bold text-sm hover:bg-tertiary/5 transition-all flex items-center justify-center gap-2"
          onClick={onReportIncorrect}
        >
          <span className="material-symbols-outlined">report</span>
          Report Incorrect
        </button>
      </div>
    </div>
  );
};
