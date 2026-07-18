import {
  expectedQuestionCount,
  roundBlueprint,
  type GenerateRoundRequest,
} from '../../shared/assessment/contracts.ts';

export function buildGenerationPrompt(request: GenerateRoundRequest): string {
  const blueprint = roundBlueprint[request.round];
  const previousResults =
    request.previousResults.length === 0
      ? 'No previous rounds. Calibrate broadly around the self-report.'
      : JSON.stringify(request.previousResults, null, 2);

  const calibrationInstruction =
    request.round === 1
      ? 'Use a deliberately broad but plausible difficulty range around the learner profile.'
      : request.round === 2
        ? 'Narrow the range using Round 1 performance, while retaining enough overlap to confirm the estimate.'
        : 'Use both earlier results to produce the five most informative final discrimination questions near the estimated boundary.';

  return `You are an expert English assessment designer for a Japanese adult learner.

Create Round ${request.round} of a three-round adaptive placement assessment. Measure vocabulary, idioms, and grammar through natural English sentence-completion questions.

Learner profile:
${JSON.stringify(request.profile, null, 2)}

Canonical learner persona snapshot:
${request.canonicalPersona ? JSON.stringify(request.canonicalPersona, null, 2) : 'No existing canonical persona.'}

Previous machine-scored results:
${previousResults}

Calibration rule:
${calibrationInstruction}

Required composition (${expectedQuestionCount(request.round)} questions total):
- vocabulary: ${blueprint.vocabulary}
- idiom: ${blueprint.idiom}
- grammar: ${blueprint.grammar}

Hard requirements:
- Every stem is a natural English sentence containing exactly one literal blank marker: _____.
- Every question has exactly four plausible English choices ordered A, B, C, D.
- There is exactly one defensible correct choice. Avoid regional, archaic, or trick answers.
- The user interface separately adds an "I don't know" choice, so do not include it.
- Within each category, questions must appear from easier to harder with strictly increasing difficultyRank values.
- Mix CEFR levels around the learner estimate. Do not merely test obscure words.
- Explanations are concise Japanese and must explain why the answer fits.
- Question ids are q-1 through q-${expectedQuestionCount(request.round)} in overall presentation order.
- Return only the complete JSON object required by the supplied schema. Do not use tools, inspect files, browse, or add Markdown.`;
}

export function buildRepairPrompt(
  round: 1 | 2 | 3,
  issues: readonly string[],
): string {
  return `Your previous Round ${round} response could not be accepted by the application.

Validation errors:
${issues.map((issue) => `- ${issue}`).join('\n')}

Return a complete replacement JSON object for Round ${round}, not a patch. Preserve the intended learner calibration, correct every listed error, obey the supplied schema, and output JSON only. Do not use tools.`;
}
