import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import bgBento from './assets/bg_bento.png';
import { Modal } from './components/common/Modal';
import { Toast, type ToastVariant } from './components/common/Toast';
import { ModelLoader } from './components/common/ModelLoader';
import { DetectionResult } from './components/detection/DetectionResult';
import { TextInputBox } from './components/detection/TextInputBox';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { addReport } from './services/reportStore';
import { useAIInference } from './hooks/useAIInference';
import { supabase } from './lib/supabaseClient';

type ExpectedLabel = 'Human' | 'AI';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'light' | 'dark' || 'light';
    }
    return 'light';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState<ToastVariant>('success');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expectedLabel, setExpectedLabel] = useState<ExpectedLabel | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(true);
  const [inputText, setInputText] = useState('');
  const [submittedText, setSubmittedText] = useState('');
  const {
    isModelLoading,
    isAnalyzing,
    isModelReady,
    modelStatus,
    modelProgress,
    result,
    analyzeText,
    preloadModel,
    reset: resetInference,
  } = useAIInference();
  const analysisResult = result
    ? {
        text: submittedText,
        predictedClass: result.label,
        aiPercentage: result.aiProbability * 100,
      }
    : null;
  const [route, setRoute] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.hash : ''
  );

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Sync theme with document class
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleAnalyze = async () => {
    if (!inputText.trim() || inputText.length < 200 || inputText.length > 10000) return;
    setSubmittedText(inputText);
    try {
      await analyzeText(inputText);
    } catch (err) {
      console.error('Inference failed:', err);
      setToastMessage('การวิเคราะห์ล้มเหลว กรุณาลองใหม่');
      setToastVariant('error');
      setIsToastVisible(true);
    }
  };

  const handleReportClick = () => {
    setExpectedLabel(null);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setExpectedLabel(null);
  };

  const handleReportSubmit = async () => {
    if (!expectedLabel) return;
    setIsSubmitting(true);
    try {
      const text = analysisResult?.text || inputText;
      const predictedClass = analysisResult?.predictedClass || '';
      const aiPercentage = analysisResult?.aiPercentage ?? 0;
      const userExpectedLabel: 'Human' | 'AI-Generated' =
        expectedLabel === 'AI' ? 'AI-Generated' : 'Human';

      const { error } = await supabase.from('user_reports').insert({
        reported_text: text,
        ai_probability: aiPercentage,
        user_expected_label: userExpectedLabel,
        status: 'pending',
      });
      if (error) throw error;

      addReport({ text, predictedClass, actualClass: expectedLabel, aiPercentage });

      setToastMessage('Thank you for your feedback!');
      setToastVariant('success');
      setIsToastVisible(true);
      setIsModalOpen(false);
      setExpectedLabel(null);
    } catch (err) {
      console.error('Report submission failed:', err);
      setToastMessage('Failed to send report. Please try again.');
      setToastVariant('error');
      setIsToastVisible(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrivacyConsent = () => {
    setShowPrivacyModal(false);
    void preloadModel();
  };

  if (route === '#/admin') {
    return <AdminDashboard onExit={() => { window.location.hash = ''; }} />;
  }

  const isBusy = isAnalyzing || isModelLoading;

  return (
    <div className="text-on-surface antialiased min-h-screen bg-background font-body transition-colors duration-300">
      {/* TopNavBar */}
      <header className="sticky top-0 w-full z-50 bg-background/70 backdrop-blur-2xl transition-colors duration-300">
        <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tighter text-on-surface font-headline">Transparent Guardian</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 text-on-surface-variant hover:text-primary transition-all rounded-full hover:bg-surface-container-low"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 md:py-20 space-y-16">
        {/* Hero Section */}
        <section className="text-center space-y-6 max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-on-surface leading-tight font-headline">
            Forensic Analysis for <br />
            <span className="text-primary">Thai AI Generation</span>
          </h1>
          <p className="text-lg md:text-xl text-on-surface-variant font-medium thai-leading">
            ความโปร่งใสในยุค AI ที่ตรวจสอบได้ด้วยความแม่นยำทางนิติวิทยาศาสตร์ภาษาไทย <br className="hidden md:block" /> 
            ขับเคลื่อนโดยเทคโนโลยี WangchanBERTa เพื่อการวิเคราะห์ที่ปราศจากข้อกังขา
          </p>
        </section>

        {/* Main App Container */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Input Area */}
          <div className={`space-y-6 min-w-0 transition-all duration-700 ease-in-out ${analysisResult ? 'lg:w-[65%]' : 'w-full'}`}>
            {(isModelLoading || (!isModelReady && modelStatus)) && (
              <ModelLoader status={modelStatus} percentage={modelProgress} />
            )}

            <div className="relative group">
              <div className="bg-surface-container-low rounded-2xl p-8 min-h-[450px] flex flex-col transition-all duration-300 focus-within:bg-surface-container-high">
                {analysisResult ? (
                  <>
                    <textarea
                      className="w-full h-full flex-grow bg-transparent border-none focus:ring-0 text-xl thai-leading text-on-surface placeholder:text-outline-variant resize-none cursor-default select-text"
                      value={inputText}
                      readOnly
                    ></textarea>
                    <div className="flex justify-between items-center mt-8 pt-8">
                      <div className="text-sm font-label tracking-widest uppercase">
                        <span className="text-primary">Analysis complete</span>
                      </div>
                      <button
                        onClick={() => { resetInference(); setInputText(''); setSubmittedText(''); }}
                        className="border border-outline text-on-surface px-10 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-surface-container-high active:scale-[0.98] transition-all font-label uppercase"
                      >
                        <span>New Analysis</span>
                        <span className="material-symbols-outlined">refresh</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <TextInputBox
                    value={inputText}
                    onChange={setInputText}
                    onAnalyze={handleAnalyze}
                    isAnalyzing={isBusy}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Results Sidebar — animates in after analysis */}
          <div className={`flex-shrink-0 sticky top-28 self-start space-y-6 transition-all duration-[1200ms] ease-in-out overflow-hidden ${analysisResult ? 'lg:w-[33%] opacity-100 max-h-[900px]' : 'w-0 opacity-0 pointer-events-none max-h-0'}`}>
            <DetectionResult
              aiPercentage={analysisResult?.aiPercentage ?? 0}
              onReportIncorrect={handleReportClick}
            />

            <div className="bg-secondary-container/20 rounded-2xl p-6 flex items-center gap-4 transition-colors duration-300">
              <div className="bg-secondary text-white p-3 rounded-full">
                <span className="material-symbols-outlined">verified_user</span>
              </div>
              <div>
                <div className="font-bold text-on-secondary-container text-sm font-headline">Privacy Secured</div>
                <div className="text-xs text-on-secondary-container/70 thai-leading">Local encryption active. Your data remains yours.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid Features */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-surface-container-low rounded-2xl p-12 overflow-hidden relative min-h-[350px] flex flex-col justify-end group transition-colors duration-300">
            <img 
              className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-20 grayscale group-hover:scale-105 transition-transform duration-700" 
              alt="neural network" 
              src={bgBento}
            />
            <div className="relative z-10 space-y-4">
              <h3 className="text-4xl font-bold tracking-tight font-headline">The Forensic Engine</h3>
              <p className="text-on-surface-variant max-w-lg thai-leading text-lg">
                เราใช้อัลกอริทึมที่ปรับแต่งมาเพื่อภาษาไทยโดยเฉพาะ ตรวจสอบโครงสร้างไวยากรณ์และความถี่ของคำที่ซับซ้อนเกินกว่าระดับภาษาทั่วไปจะทำได้
              </p>
            </div>
          </div>
          <div className="bg-primary text-white rounded-2xl p-12 flex flex-col justify-between transition-colors duration-300">
            <span className="material-symbols-outlined text-6xl">security</span>
            <div className="space-y-4">
              <h3 className="text-3xl font-bold font-headline">Privacy-First Policy</h3>
              <p className="text-on-primary-container/80 text-sm thai-leading">
                ข้อมูลทุกตัวอักษรจะถูกทำลายหลังการวิเคราะห์เสร็จสิ้น ไม่มีการจัดเก็บลงฐานข้อมูลเพื่อฝึกฝนโมเดลซ้ำหากว่าไม่มีการยินยอมจากผู้ใช้ในการส่งข้อความเพื่อปรับปรุงความแม่นยำของโมเดล
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-16 bg-surface-container-low mt-20 transition-colors duration-300">
        <div className="flex flex-col md:flex-row justify-between items-center px-10 gap-8 max-w-7xl mx-auto">
          <div className="flex flex-col gap-2">
            <span className="font-black text-on-surface text-xl font-headline">Transparent Guardian</span>
            <p className="text-on-surface-variant text-[10px] tracking-widest uppercase font-label font-bold">
              © 2026 The Transparent Guardian. Powered by WangchanBERTa. Clinical, precise, and indisputable forensic analysis.
            </p>
          </div>
          <a
            href="#/admin"
            className="text-[10px] tracking-widest uppercase font-label font-bold text-on-surface-variant hover:text-primary transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">admin_panel_settings</span>
            Admin Review Queue
          </a>
        </div>
      </footer>

      {/* Privacy Consent Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 bg-on-surface/40 backdrop-blur-xl transition-all duration-300">
          <div className="bg-surface rounded-2xl max-w-xl w-full p-12 space-y-10 shadow-2xl relative overflow-hidden transition-colors duration-300">
            <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
            <div className="space-y-6">
              <div className="flex items-center gap-4 text-primary">
                <span className="material-symbols-outlined scale-150">verified</span>
                <h2 className="text-3xl font-bold tracking-tight font-headline">Privacy Consensus</h2>
              </div>
              <p className="text-on-surface-variant thai-leading text-lg">
                ก่อนเริ่มต้นใช้งาน: เราเคารพในความเป็นส่วนตัวของคุณ โดยระบบนี้แบ่งการทำงานออกเป็น 2 โหมด
              </p>
              <ul className="text-on-surface-variant thai-leading text-base space-y-3 mt-4 list-none">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary mt-0.5 flex-shrink-0">verified_user</span>
                  <span><strong className="text-on-surface">โหมดวิเคราะห์ (Inference):</strong> ข้อความถูกประมวลผลบนอุปกรณ์ของคุณเท่านั้น ไม่มีการส่งข้อมูลออกไปยังเซิร์ฟเวอร์ใดๆ ทั้งสิ้น (Zero-Data Leakage)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-secondary mt-0.5 flex-shrink-0">volunteer_activism</span>
                  <span><strong className="text-on-surface">โหมดแจ้งผลตอบรับ (Feedback — ไม่บังคับ):</strong> หากคุณเลือกรายงานผลที่ไม่ถูกต้อง ระบบจะขอความยินยอมก่อนส่งข้อความไปยังเซิร์ฟเวอร์แบบไม่ระบุตัวตน เพื่อพัฒนาโมเดลในอนาคต</span>
                </li>
              </ul>
            </div>
            <div className="flex justify-center">
              <button
                onClick={handlePrivacyConsent}
                className="w-full py-5 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20 font-label uppercase"
              >
                I UNDERSTAND
              </button>
            </div>
            <div className="text-[10px] text-center text-outline uppercase tracking-widest font-bold font-label">
              GDPR & PDPA COMPLIANT CORE
            </div>
          </div>
        </div>
      )}

      {/* Report Error Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        title="What should this text be classified as?"
      >
        <div className="p-2 space-y-6">
          <p className="text-sm thai-leading text-slate-600 dark:text-slate-300">
            เลือกหมวดที่ถูกต้องเพื่อช่วยปรับปรุงโมเดล (Pick the correct label to help improve the model.)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setExpectedLabel('Human')}
              disabled={isSubmitting}
              className={`py-5 rounded-xl font-bold text-sm uppercase font-label transition-all ${
                expectedLabel === 'Human'
                  ? 'bg-emerald-600 text-white shadow-lg ring-2 ring-emerald-400'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'
              }`}
            >
              Human
            </button>
            <button
              type="button"
              onClick={() => setExpectedLabel('AI')}
              disabled={isSubmitting}
              className={`py-5 rounded-xl font-bold text-sm uppercase font-label transition-all ${
                expectedLabel === 'AI'
                  ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-400'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'
              }`}
            >
              AI-Generated
            </button>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={handleModalClose}
              disabled={isSubmitting}
              className="px-6 py-3 rounded-xl bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600 font-bold text-sm transition-all uppercase font-label"
            >
              Cancel
            </button>
            <button
              onClick={handleReportSubmit}
              disabled={isSubmitting || !expectedLabel}
              className="px-6 py-3 rounded-xl bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all uppercase font-label shadow-lg"
            >
              {isSubmitting ? 'Sending...' : 'Submit Report'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      <Toast
        message={toastMessage}
        isVisible={isToastVisible}
        onClose={() => setIsToastVisible(false)}
        variant={toastVariant}
      />
    </div>
  );
}

export default App;
