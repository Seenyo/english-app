import { useContext } from 'react';
import { AssessmentContext } from './AssessmentContext';

export function useAssessment() {
  const context = useContext(AssessmentContext);
  if (!context) {
    throw new Error('useAssessment must be used inside AssessmentProvider');
  }
  return context;
}
