import React, { useState } from 'react';
import { Button } from './components/common/Button';
import { Modal } from './components/common/Modal';
import { Toast } from './components/common/Toast';
import { DetectionResult } from './components/detection/DetectionResult'; // Import DetectionResult
import { submitFeedback } from './services/feedbackService';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('textInput'); // New state for tabs
  const [showPrivacyModal, setShowPrivacyModal] = useState(true); // State for privacy modal

  // Mock inference result for demonstration
  const mockResult = { text: "This is a sample text.", predictedClass: "AI", percentage: 90 };

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
        text: mockResult.text,
        predictedClass: mockResult.predictedClass,
        actualClass: "Human", // Assuming user reports it as Human
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
    // Here you might set a cookie or local storage item to remember consent
  };

  return (
    <div className="text-on-surface antialiased">
      {/* TopNavBar */}
      <header className="sticky top-0 w-full z-50 bg-[#faf8ff]/70 backdrop-blur-2xl">
        <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tighter text-slate-900">Transparent Guardian</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a className="text-indigo-600 border-b-2 border-indigo-600 pb-1 font-semibold text-sm tracking-tight font-['Sarabun'] transition-all duration-300" href="#">Detector</a>
            <a className="text-slate-600 font-medium text-sm tracking-tight font-['Sarabun'] hover:text-indigo-500 transition-all duration-300" href="#">Research</a>
            <a className="text-slate-600 font-medium text-sm tracking-tight font-['Sarabun'] hover:text-indigo-500 transition-all duration-300" href="#">API</a>
          </nav>
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-600 hover:text-indigo-500 transition-all">
              <span className="material-symbols-outlined" data-icon="dark_mode">dark_mode</span>
            </button>
            <button className="p-2 text-slate-600 hover:text-indigo-500 transition-all">
              <span className="material-symbols-outlined" data-icon="help_outline">help_outline</span>
            </button>
            <button className="bg-primary text-white px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all">
              Sign In
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 md:py-20 space-y-16">
        {/* Hero Section */}
        <section className="text-center space-y-6 max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-on-surface leading-tight">
            Forensic Analysis for <br />
            <span className="text-primary">Thai AI Generation</span>
          </h1>
          <p className="text-lg md:text-xl text-on-surface-variant font-medium thai-leading">
            ความโปร่งใสในยุค AI ที่ตรวจสอบได้ด้วยความแม่นยำทางนิติวิทยาศาสตร์ภาษาไทย <br className="hidden md:block" /> 
            ขับเคลื่อนโดยเทคโนโลยี WangchanBERTa เพื่อการวิเคราะห์ที่ปราศจากข้อกังขา
          </p>
        </section>

        {/* Main App Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Input Area */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-surface-container-low rounded-[2rem] p-2 flex gap-1 w-fit mx-auto md:mx-0">
              <button 
                className={`px-6 py-2.5 rounded-full text-sm transition-all ${activeTab === 'textInput' ? 'bg-white shadow-sm text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high font-medium'}`}
                onClick={() => setActiveTab('textInput')}
              >
                Text Input
              </button>
              <button 
                className={`px-6 py-2.5 rounded-full text-sm transition-all ${activeTab === 'ocrMode' ? 'bg-white shadow-sm text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high font-medium'}`}
                onClick={() => setActiveTab('ocrMode')}
              >
                OCR Mode
              </button>
            </div>

            {activeTab === 'textInput' && (
              <div className="relative group">
                <div className="bg-surface-container-low rounded-[2rem] p-8 min-h-[400px] flex flex-col transition-all focus-within:bg-surface-container-high">
                  <textarea className="w-full h-full flex-grow bg-transparent border-none focus:ring-0 text-xl thai-leading text-on-surface placeholder:text-outline-variant resize-none" placeholder="วางข้อความภาษาไทยที่ต้องการตรวจสอบที่นี่..."></textarea>
                  <div className="flex justify-between items-center mt-6 pt-6 border-t border-outline-variant/10">
                    <div className="text-sm font-label tracking-widest text-outline uppercase">
                      Character Count: 0 / 5,000
                    </div>
                    <button className="signature-gradient text-white px-10 py-4 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 active:scale-[0.98] shadow-xl shadow-primary/20 transition-all">
                      <span>Analyze Text</span>
                      <span className="material-symbols-outlined" data-icon="analytics">analytics</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ocrMode' && (
              <div className="relative group">
                <div className="bg-surface-container-low rounded-[2rem] p-8 min-h-[400px] flex flex-col transition-all focus-within:bg-surface-container-high justify-center items-center text-center">
                  {/* OCR Mode UI Placeholder */}
                  <span className="material-symbols-outlined text-primary text-6xl mb-4">image_search</span>
                  <h3 className="text-2xl font-bold mb-2">Upload Image for OCR Analysis</h3>
                  <p className="text-on-surface-variant mb-6">Drag & drop your image here, or click to browse. We support JPG, PNG, and PDF.</p>
                  <input type="file" accept="image/*,application/pdf" className="hidden" id="ocr-file-upload" />
                  <label htmlFor="ocr-file-upload" className="signature-gradient text-white px-8 py-3 rounded-xl font-bold text-sm cursor-pointer hover:opacity-90 active:scale-[0.98] shadow-lg shadow-primary/20 transition-all">
                    Browse Files
                  </label>
                  {/* Tesseract.js logic will be integrated here later */}
                </div>
              </div>
            )}
          </div>

          {/* Results Sidebar (Conditional State Shown) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-surface-container-highest rounded-[2rem] p-8 space-y-8 sticky top-28">
              <div className="flex justify-between items-start">
                <span className="text-xs font-label tracking-widest text-outline uppercase font-bold">Forensic Result</span>
                <div className="bg-tertiary-container text-tertiary px-3 py-1 rounded-full text-xs font-bold">
                  AI DETECTED
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-7xl font-black text-on-surface tracking-tighter">{mockResult.percentage}%</div>
                <div className="text-sm font-medium text-on-surface-variant thai-leading">ความน่าจะเป็นที่ข้อความนี้ถูกสร้างโดยปัญญาประดิษฐ์</div>
              </div>
              <div className="w-full bg-surface-container rounded-full h-4 overflow-hidden">
                <div className="bg-tertiary h-full rounded-full" style={{ width: `${mockResult.percentage}%` }}></div>
              </div>
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3 text-sm font-medium text-on-surface">
                  <span className="material-symbols-outlined text-tertiary" data-icon="warning">warning</span>
                  <span>Unnatural syntactic patterns detected</span>
                </div>
                <div className="flex items-center gap-3 text-sm font-medium text-on-surface">
                  <span className="material-symbols-outlined text-tertiary" data-icon="fingerprint">fingerprint</span>
                  <span>Repetitive linguistic tokens found</span>
                </div>
              </div>
              <div className="pt-6 border-t border-outline-variant/20">
                <button 
                  className="w-full py-4 text-tertiary border border-tertiary/20 rounded-xl font-bold text-sm hover:bg-tertiary/5 transition-all flex items-center justify-center gap-2"
                  onClick={handleReportClick}
                >
                  <span className="material-symbols-outlined" data-icon="report">report</span>
                  Report Incorrect
                </button>
              </div>
            </div>
            <div className="bg-secondary-container/30 rounded-[2rem] p-6 flex items-center gap-4">
              <div className="bg-secondary text-white p-3 rounded-full">
                <span className="material-symbols-outlined" data-icon="verified_user">verified_user</span>
              </div>
              <div>
                <div className="font-bold text-on-secondary-container text-sm">Privacy Secured</div>
                <div className="text-xs text-on-secondary-container/70 thai-leading">Local encryption active. Your data remains yours.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid for Features/Info */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-surface-container-low rounded-[2rem] p-10 overflow-hidden relative min-h-[300px] flex flex-col justify-end">
            <img className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30 grayscale" alt="close-up of advanced neural network visualization with flowing blue light particles in a deep dark space" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBcw_W6q7PvZsTyyXYoos-iTHjoiJ4S0FkhsdP51QRZ_mZjPU2vv0W0Q0uHzOSV05WfiZf5JwT-zW_coIkjdXQhX9BVdoUeaxy_0GHpIOkxwet5GN0Xk4MEyNsSmxHMZ8JpimLGctHjDreriXxSIAhFTJaAoePVHaqBD5XvoweiFQ6tGe8w3GiuZxcmQodIYenEVXh-Xd3cFDLdtC-SRe7wzKdRU5S6h_ptHPjl2AUhRQyPbSfr0FmdcDt3Yk-4vq-9g3BGRpMmpeE"/>
            <div className="relative z-10 space-y-4">
              <h3 className="text-3xl font-bold tracking-tight">The Forensic Engine</h3>
              <p className="text-on-surface-variant max-w-lg thai-leading">เราใช้อัลกอริทึมที่ปรับแต่งมาเพื่อภาษาไทยโดยเฉพาะ ตรวจสอบโครงสร้างไวยากรณ์และความถี่ของคำที่ซับซ้อนเกินกว่าระดับภาษาทั่วไปจะทำได้</p>
            </div>
          </div>
          <div className="bg-primary text-white rounded-[2rem] p-10 flex flex-col justify-between">
            <span className="material-symbols-outlined text-5xl" data-icon="security">security</span>
            <div className="space-y-4">
              <h3 className="text-2xl font-bold">Privacy-First Policy</h3>
              <p className="text-on-primary-container text-sm thai-leading">ข้อมูลทุกตัวอักษรจะถูกทำลายหลังการวิเคราะห์เสร็จสิ้น ไม่มีการจัดเก็บลงฐานข้อมูลเพื่อฝึกฝนโมเดลซ้ำ</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-12 bg-[#f2f3ff] mt-20">
        <div className="flex flex-col md:flex-row justify-between items-center px-10 gap-8 max-w-7xl mx-auto">
          <div className="flex flex-col gap-2">
            <span className="font-black text-slate-900 text-lg">Transparent Guardian</span>
            <p className="text-slate-500 font-['Sarabun'] text-[10px] tracking-widest uppercase">
              © 2024 The Transparent Guardian. Powered by WangchanBERTa. Clinical, precise, and indisputable forensic analysis.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <a className="text-slate-500 font-medium text-xs font-['Sarabun'] tracking-wide uppercase hover:text-indigo-600 transition-colors" href="#">GitHub</a>
            <a className="text-slate-500 font-medium text-xs font-['Sarabun'] tracking-wide uppercase hover:text-indigo-600 transition-colors" href="#">Privacy Policy</a>
            <a className="text-slate-500 font-medium text-xs font-['Sarabun'] tracking-wide uppercase hover:text-indigo-600 transition-colors" href="#">Terms of Service</a>
            <a className="text-slate-500 font-medium text-xs font-['Sarabun'] tracking-wide uppercase hover:text-indigo-600 transition-colors underline decoration-2 underline-offset-4 decoration-indigo-300" href="#">Thai NLP Docs</a>
          </div>
        </div>
      </footer>

      {/* Privacy Consent Modal (Overlay representation) */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 bg-on-surface/40 backdrop-blur-md">
          <div className="bg-surface rounded-[2rem] max-w-xl w-full p-10 space-y-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-primary">
                <span className="material-symbols-outlined scale-125" data-icon="verified" data-weight="fill">verified</span>
                <h2 className="text-2xl font-bold tracking-tight">Privacy Consensus</h2>
              </div>
              <p className="text-on-surface-variant thai-leading">
                ก่อนเริ่มต้นใช้งาน: เราเคารพในความเป็นส่วนตัวของคุณ ข้อมูลข้อความที่คุณวิเคราะห์จะถูกส่งผ่านช่องทางที่เข้ารหัส และจะถูกลบออกจากหน่วยความจำชั่วคราวทันทีหลังแสดงผล
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button className="py-4 rounded-xl border border-outline-variant font-bold text-sm hover:bg-surface-container transition-all" onClick={() => setShowPrivacyModal(false)}>
                DECLINE
              </button>
              <button className="py-4 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20" onClick={handlePrivacyConsent}>
                I UNDERSTAND
              </button>
            </div>
            <div className="text-[10px] text-center text-outline uppercase tracking-widest font-bold">
              GDPR & PDPA COMPLIANT CORE
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal (existing logic) */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          title="ช่วยเราพัฒนาความแม่นยำ (Help Us Improve)"
        >
          <p className="text-sm mb-4">
            คุณยินยอมที่จะส่งข้อความนี้แบบไม่ระบุตัวตนเพื่อใช้ในการปรับปรุงโมเดลหรือไม่? (Do you consent to share this text anonymously with the developer to improve the WangchanBERTa model? No personal data or login is required.)
          </p>
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="secondary" onClick={handleModalClose} disabled={isSubmitting}>
              ยกเลิก (Cancel)
            </Button>
            <Button variant="primary" onClick={handleAgreeAndSend} isLoading={isSubmitting}>
              ยินยอมและส่งข้อมูล (Agree & Send)
            </Button>
          </div>
        </Modal>
      )}

      {/* Success Toast (existing logic) */}
      <Toast
        message={toastMessage}
        isVisible={isToastVisible}
        onClose={() => setIsToastVisible(false)}
      />
    </div>
  );
}

export default App;
