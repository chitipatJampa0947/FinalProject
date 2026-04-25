import React from 'react';

interface DetectionResultProps {
  result: string;
  percentage: number;
  onReportIncorrect: () => void;
}

export const DetectionResult: React.FC<DetectionResultProps> = ({ result, percentage, onReportIncorrect }) => {
  const isAI = result.toUpperCase() === 'AI';

  return (
    <div className="bg-surface-container-highest rounded-2xl p-10 space-y-10 transition-all duration-500 shadow-sm">
      <div className="flex justify-between items-start">
        <span className="text-xs font-label tracking-widest text-outline uppercase font-bold">Forensic Result</span>
        <div className={`px-4 py-1.5 rounded-full text-xs font-bold font-label uppercase ${
          isAI ? 'bg-tertiary-container text-tertiary' : 'bg-secondary-container text-on-secondary-container'
        }`}>
          {isAI ? 'AI DETECTED' : 'HUMAN VERIFIED'}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-8xl font-black text-on-surface tracking-tighter font-headline leading-none">{percentage}%</div>
        <div className="text-base font-medium text-on-surface-variant thai-leading max-w-[240px]">
          {isAI 
            ? 'ความน่าจะเป็นที่ข้อความนี้ถูกสร้างโดยปัญญาประดิษฐ์' 
            : 'ความน่าจะเป็นที่ข้อความนี้ถูกสร้างโดยมนุษย์'}
        </div>
      </div>

      <div className="w-full bg-surface-container rounded-full h-5 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ease-out ${isAI ? 'bg-tertiary' : 'bg-secondary'}`} 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      <div className="space-y-6 pt-6">
        {isAI ? (
          <>
            <div className="flex items-start gap-4 text-sm font-medium text-on-surface">
              <span className="material-symbols-outlined text-tertiary scale-110">warning</span>
              <span className="thai-leading">ตรวจพบรูปแบบโครงสร้างประโยคที่ไม่เป็นธรรมชาติ (Unnatural syntactic patterns detected)</span>
            </div>
            <div className="flex items-start gap-4 text-sm font-medium text-on-surface">
              <span className="material-symbols-outlined text-tertiary scale-110">fingerprint</span>
              <span className="thai-leading">ตรวจพบร่องรอยการทำซ้ำของคำที่เป็นเอกลักษณ์ของโมเดล (Repetitive linguistic tokens found)</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-4 text-sm font-medium text-on-surface">
              <span className="material-symbols-outlined text-secondary scale-110">verified</span>
              <span className="thai-leading">ภาษาไทยมีความลื่นไหลเป็นธรรมชาติ (Organic linguistic flow detected)</span>
            </div>
            <div className="flex items-start gap-4 text-sm font-medium text-on-surface">
              <span className="material-symbols-outlined text-secondary scale-110">auto_awesome</span>
              <span className="thai-leading">มีความหลากหลายของโครงสร้างประโยคตามวิสัยมนุษย์ (Natural variation in sentence structure)</span>
            </div>
          </>
        )}
      </div>

      <div className="pt-8">
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
