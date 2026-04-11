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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
      <h1 className="text-4xl font-bold mb-8">AI Detection Web App (Mock)</h1>
      
      <DetectionResult 
        result={mockResult.predictedClass}
        percentage={mockResult.percentage}
        onReportIncorrect={handleReportClick}
      />

      {/* Consent Modal */}
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
