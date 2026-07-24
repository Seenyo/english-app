import type { User } from '@supabase/supabase-js';
import type {
  AnswerVocabularyMemoryRequest,
  StartVocabularyMemoryRequest,
  StartVocabularySessionRequest,
  VocabularyKind,
  VocabularyOperation,
} from '../../shared/vocabulary/contracts.ts';
import type { ServerConfig } from '../config.ts';
import { VocabularyRepository } from './repository.ts';

export class VocabularyService {
  constructor(private readonly repository: VocabularyRepository) {}

  static create(config: ServerConfig) {
    return new VocabularyService(new VocabularyRepository(config));
  }

  getOverview(user: User) {
    return this.repository.getOverview(user.id);
  }

  startSession(user: User, input: StartVocabularySessionRequest) {
    return this.repository.startSession(user.id, input);
  }

  getResumableSession(user: User, kind: VocabularyKind) {
    return this.repository.getResumableSession(user.id, kind);
  }

  saveOperations(
    user: User,
    sessionId: string,
    operations: VocabularyOperation[],
    position: number,
  ): Promise<void> {
    return this.repository.saveOperations(
      user.id,
      sessionId,
      operations,
      position,
    );
  }

  finishSession(
    user: User,
    sessionId: string,
    status: 'paused' | 'completed',
    position: number,
  ): Promise<void> {
    return this.repository.finishSession(user.id, sessionId, status, position);
  }

  loadSession(user: User, sessionId: string) {
    return this.repository.loadSession(user.id, sessionId);
  }

  getMemoryOverview(user: User) {
    return this.repository.getMemoryOverview(user.id);
  }

  startMemorySession(user: User, input: StartVocabularyMemoryRequest) {
    return this.repository.startMemorySession(user.id, input);
  }

  answerMemoryCard(
    user: User,
    sessionId: string,
    input: AnswerVocabularyMemoryRequest,
  ) {
    return this.repository.answerMemoryCard(user.id, sessionId, input);
  }
}
