import type { User } from '@supabase/supabase-js';
import type {
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
}
