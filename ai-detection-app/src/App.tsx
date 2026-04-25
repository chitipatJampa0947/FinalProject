import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import bgBento from './assets/bg_bento.png';
import { Modal } from './components/common/Modal';
import { Toast } from './components/common/Toast';
import { DetectionResult } from './components/detection/DetectionResult';
import { submitFeedback } from './services/feedbackService';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'textInput' | 'ocrMode'>('textInput');
  const [showPrivacyModal, setShowPrivacyModal] = useState(true);
  const [inputText, setInputText] = useState('');
  const [analysisResult, setAnalysisResult] = useState<{ text: string; predictedClass: string; percentage: number } | null>(null);

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

  const handleAnalyze = () => {
    if (!inputText.trim() || inputText.length <= 200) return;
    // TODO: replace with real API call
    setAnalysisResult({ text: inputText, predictedClass: "Human", percentage: 85 });
  };

  const handleReportClick = () => {
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  const handleAgreeAndSend = async () => {
    setIsSubmitting(true);
    try {
      const mockFeedbackPayload = {
        text: analysisResult?.text || inputText,
        predictedClass: analysisResult?.predictedClass || '',
        actualClass: analysisResult?.predictedClass === 'AI' ? 'Human' : 'AI',
      };
      await submitFeedback(mockFeedbackPayload);
      setToastMessage("Thank you for your feedback!");
      setIsToastVisible(true);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Feedback submission failed:", error);
      setToastMessage("Failed to send feedback.");
      setIsToastVisible(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrivacyConsent = () => {
    setShowPrivacyModal(false);
  };

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
            <div className="bg-surface-container-low rounded-full p-2 flex gap-1 w-fit mx-auto md:mx-0 transition-colors duration-300">
              <button 
                onClick={() => setActiveTab('textInput')}
                className={`px-6 py-2.5 rounded-full text-sm transition-all ${activeTab === 'textInput' ? 'bg-surface shadow-sm text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high font-medium'}`}
              >
                Text Input
              </button>
              <button 
                onClick={() => setActiveTab('ocrMode')}
                className={`px-6 py-2.5 rounded-full text-sm transition-all ${activeTab === 'ocrMode' ? 'bg-surface shadow-sm text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high font-medium'}`}
              >
                OCR Mode
              </button>
            </div>

            <div className="relative group">
              <div className="bg-surface-container-low rounded-2xl p-8 min-h-[450px] flex flex-col transition-all duration-300 focus-within:bg-surface-container-high">
                {activeTab === 'textInput' ? (
                  <>
                    <textarea
                      className={`w-full h-full flex-grow bg-transparent border-none focus:ring-0 text-xl thai-leading text-on-surface placeholder:text-outline-variant resize-none ${analysisResult ? 'cursor-default select-text' : ''}`}
                      placeholder="วางข้อความภาษาไทยที่ต้องการตรวจสอบที่นี่..."
                      value={inputText}
                      onChange={(e) => { if (!analysisResult) setInputText(e.target.value); }}
                      readOnly={!!analysisResult}
                    ></textarea>
                    <div className="flex justify-between items-center mt-8 pt-8">
                      <div className="text-sm font-label tracking-widest uppercase">
                        {analysisResult ? (
                          <span className="text-primary">Analysis complete</span>
                        ) : inputText.length > 0 && inputText.length <= 200 ? (
                          <span className="text-error">ข้อความสั้นเกินไป ({inputText.length} / 200 ตัวอักษรขั้นต่ำ)</span>
                        ) : (
                          <span className="text-outline">Character Count: {inputText.length} / 5,000</span>
                        )}
                      </div>
                      {analysisResult ? (
                        <button
                          onClick={() => { setAnalysisResult(null); setInputText(''); }}
                          className="border border-outline text-on-surface px-10 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-surface-container-high active:scale-[0.98] transition-all font-label uppercase"
                        >
                          <span>New Analysis</span>
                          <span className="material-symbols-outlined">refresh</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleAnalyze}
                          disabled={inputText.length <= 200}
                          className="signature-gradient text-white px-10 py-4 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 active:scale-[0.98] shadow-xl shadow-primary/20 transition-all font-label uppercase disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100"
                        >
                          <span>Analyze Text</span>
                          <span className="material-symbols-outlined">analytics</span>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center text-center space-y-8 py-12">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center transition-colors duration-300">
                      <span className="material-symbols-outlined text-5xl text-primary">image_search</span>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-3xl font-bold font-headline">OCR Document Scan</h3>
                      <p className="text-on-surface-variant max-w-sm mx-auto thai-leading">
                        อัปโหลดรูปภาพหรือไฟล์ PDF เพื่อสกัดข้อความภาษาไทยออกมาวิเคราะห์
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <button className="signature-gradient text-white px-8 py-4 rounded-xl font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all uppercase font-label">
                        Upload Image
                      </button>
                      {/* Tesseract.js logic will be integrated here later */}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results Sidebar — animates in after analysis */}
          <div className={`flex-shrink-0 sticky top-28 self-start space-y-6 transition-all duration-[1200ms] ease-in-out overflow-hidden ${analysisResult ? 'lg:w-[33%] opacity-100 max-h-[900px]' : 'w-0 opacity-0 pointer-events-none max-h-0'}`}>
            <DetectionResult
              result={analysisResult?.predictedClass ?? ''}
              percentage={analysisResult?.percentage ?? 0}
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
              © 2025 The Transparent Guardian. Powered by WangchanBERTa. Clinical, precise, and indisputable forensic analysis.
            </p>
          </div>
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
                ก่อนเริ่มต้นใช้งาน: เราเคารพในความเป็นส่วนตัวของคุณ ข้อมูลข้อความที่คุณวิเคราะห์จะประมวลผลบนอุปกรณ์ของคุณเท่านั้น ไม่มีการส่งข้อมูลออกไปยังเซิร์ฟเวอร์หรือจัดเก็บไว้ที่ใดๆ ข้อมูลจะถูกทำลายทันทีหลังการวิเคราะห์เสร็จสิ้น คุณสามารถใช้แอปนี้ได้อย่างมั่นใจในความปลอดภัยและความเป็นส่วนตัวของข้อมูลของคุณ
              </p>
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

      {/* Feedback Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        title="ช่วยเราพัฒนาความแม่นยำ (Help Us Improve)"
      >
        <div className="p-2">
          <p className="text-base mb-6 thai-leading text-slate-500">
            คุณยินยอมที่จะส่งข้อความนี้แบบไม่ระบุตัวตนเพื่อใช้ในการปรับปรุงโมเดลหรือไม่? (Do you consent to share this text anonymously with the developer to improve the WangchanBERTa model? No personal data or login is required.)
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={handleModalClose} disabled={isSubmitting} className="px-6 py-3 rounded-xl bg-surface-container-high text-on-surface font-bold text-sm hover:bg-surface-container-highest transition-all uppercase font-label">
              ยกเลิก (Cancel)
            </button>
            <button onClick={handleAgreeAndSend} disabled={isSubmitting} className="px-6 py-3 rounded-xl bg-rose-500 text-white font-bold text-sm hover:opacity-90 transition-all uppercase font-label shadow-lg shadow-primary/20">
              {isSubmitting ? 'Sending...' : 'ยินยอมและส่งข้อมูล (Agree & Send)'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Success Toast */}
      <Toast
        message={toastMessage}
        isVisible={isToastVisible}
        onClose={() => setIsToastVisible(false)}
      />
    </div>
  );
}

export default App;
