import { useContext } from 'react';
import { LearningContext } from './LearningContext';

export function useLearning() {
  const value = useContext(LearningContext);
  if (!value)
    throw new Error('useLearning must be used inside LearningProvider');
  return value;
}
