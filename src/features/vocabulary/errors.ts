import { isVocabularySessionConflictCode } from '../../../shared/vocabulary/contracts.ts';

export class VocabularyApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'VocabularyApiError';
  }
}

export function isVocabularySessionConflict(error: unknown): boolean {
  return (
    error instanceof VocabularyApiError &&
    (error.status === 409 || isVocabularySessionConflictCode(error.code))
  );
}

export function requiresVocabularySessionRecovery(error: unknown): boolean {
  return (
    isVocabularySessionConflict(error) ||
    (error instanceof VocabularyApiError && !error.retryable)
  );
}
