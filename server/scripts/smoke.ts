import type { GenerateRoundRequest } from '../../shared/assessment/contracts.ts';
import {
  createAssessmentThreadFactory,
  generateAssessmentRound,
} from '../assessment/generator.ts';
import { readServerConfig } from '../config.ts';

const config = readServerConfig();
const request: GenerateRoundRequest = {
  round: 1,
  threadId: null,
  profile: {
    selfAssessment:
      'I am a Japanese adult learner. I can read everyday English and technical documentation, but I want a precise estimate of my vocabulary, idiom, and grammar level.',
    eikenGrade: null,
    toeicScore: null,
  },
  previousResults: [],
};

const result = await generateAssessmentRound(request, {
  threadFactory: createAssessmentThreadFactory(config),
  maxRepairAttempts: config.repairAttempts,
});

console.log(
  JSON.stringify(
    {
      threadId: result.threadId,
      repairCount: result.repairCount,
      questionCount: result.batch.questions.length,
      categories: result.batch.questions.map((question) => question.category),
    },
    null,
    2,
  ),
);
