import assert from 'node:assert/strict';
import test from 'node:test';
import type { User } from '@supabase/supabase-js';
import type { ServerConfig } from '../config.ts';
import type { LearningRepository } from './repository.ts';
import { LearningService } from './service.ts';

test('dry-run learning endpoints never touch persistence or Codex', async () => {
  const repository = new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(
          `Dry-run unexpectedly accessed repository.${String(property)}`,
        );
      },
    },
  ) as LearningRepository;
  const service = new LearningService(
    { assessmentMode: 'dry-run' } as ServerConfig,
    repository,
    null,
  );
  const user = { id: 'user-dry-run' } as User;

  assert.deepEqual(await service.getOverview(user), {
    mode: 'dry-run',
    analysisStatus: 'unavailable',
    analysisMessage: 'Dry-runではCodex分析とプロフィール更新を行いません。',
    persona: null,
    latestReport: null,
  });
  assert.equal(await service.getPersona(user), null);
  assert.deepEqual(await service.listReports(user), []);
  await service.preparePersona('user-dry-run', {
    selfAssessment:
      'This dry-run persona must remain transient and must never be persisted.',
    eikenGrade: null,
    toeicScore: null,
  });
  await service.queueAssessmentAnalysis('user-dry-run', 'attempt-dry-run');
  await service.retryLatestAnalysis(user);

  await assert.rejects(
    service.updatePersona(user, 1, {
      currentSelfDescription:
        'This dry-run persona must remain transient and must never be persisted.',
      goals: { shortTerm: '', mediumTerm: '', longTerm: '' },
      motivation: '',
      interests: [],
      studyPurpose: '',
      dailyStudyMinutes: null,
      preferredMethods: [],
      difficultMethods: [],
      correctionNote: '',
      eikenGrade: null,
      toeicScore: null,
    }),
    /Dry-run/,
  );
  await assert.rejects(
    service.getReport(user, '1670bfc0-0c39-45ab-83de-32e581072bc6'),
    /Dry-run/,
  );
});
