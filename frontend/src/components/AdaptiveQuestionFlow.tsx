import React, { useState, useEffect } from 'react';
import { Bot, CheckCircle2, ChevronRight, Sparkles } from 'lucide-react';
import type { AIEvidenceItem, FollowupQuestion } from '../types';
import { selectAdaptiveQuestions } from '../services/aiPipeline';

interface AdaptiveQuestionFlowProps {
  evidence: AIEvidenceItem[];
  onComplete: (answers: Record<string, string>) => void;
}

export const AdaptiveQuestionFlow: React.FC<AdaptiveQuestionFlowProps> = ({ evidence, onComplete }) => {
  const [questions, setQuestions] = useState<FollowupQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    // Phase 4: Dynamic question selection engine
    // Dynamically select the next useful 3-5 questions based on AI evidence
    const selected = selectAdaptiveQuestions(evidence);
    setQuestions(selected);
  }, [evidence]);

  if (questions.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px' }}>
        <CheckCircle2 color="#10b981" size={32} style={{ margin: '0 auto 12px' }} />
        <h4 style={{ margin: '0 0 8px', color: '#0f172a' }}>No Additional Context Needed</h4>
        <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
          The AI was able to confidently assess the ecological features from your photo.
        </p>
        <button
          onClick={() => onComplete(answers)}
          style={{
            marginTop: '16px',
            padding: '10px 24px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Continue <ChevronRight size={16} style={{ verticalAlign: 'middle' }} />
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const isFinished = currentIndex >= questions.length;

  const handleSelectOption = (value: string) => {
    const newAnswers = { ...answers, [currentQ.questionKey]: value };
    setAnswers(newAnswers);
    
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onComplete(newAnswers);
    }
  };

  if (isFinished) return null;

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '50%', display: 'flex' }}>
          <Bot size={24} color="#3b82f6" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>AI Assistant Follow-up</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
            Question {currentIndex + 1} of {questions.length} • Based on detected {currentQ.indicatorType.replace('_', ' ')}
          </p>
        </div>
      </div>

      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 500, color: '#1e293b' }}>
          {currentQ.questionText}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {currentQ.options?.map((opt) => {
          const isSuggested = currentQ.aiSuggestedAnswer === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => handleSelectOption(opt.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: isSuggested ? '#f0fdf4' : '#ffffff',
                border: isSuggested ? '2px solid #22c55e' : '1px solid #cbd5e1',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = isSuggested ? '#16a34a' : '#94a3b8')}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = isSuggested ? '#22c55e' : '#cbd5e1')}
            >
              <span style={{ fontSize: '15px', color: '#334155', fontWeight: isSuggested ? 600 : 400 }}>
                {opt.label}
              </span>
              {isSuggested && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#15803d', fontWeight: 600, background: '#dcfce7', padding: '4px 8px', borderRadius: '12px' }}>
                  <Sparkles size={14} /> AI Suggests
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div style={{ marginTop: '24px', background: '#e2e8f0', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
        <div 
          style={{ 
            height: '100%', 
            background: '#3b82f6', 
            width: `${((currentIndex) / questions.length) * 100}%`,
            transition: 'width 0.3s ease'
          }} 
        />
      </div>
    </div>
  );
};
