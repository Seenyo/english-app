# Gemma learning-task quality review

## Scope

Gemma-4 12B OptiQ generated ten items for each of three prospective learning
features, using the same learner profile as the existing placement-assessment
comparison:

- contextual vocabulary and idiom questions (six words and four idioms)
- Japanese-to-English sentence ordering
- standalone reading comprehension (180–260 words per passage)

The evaluation targets CEFR B2–C1 and prioritizes performance over latency.
Each item is generated independently with three requests in flight. Immutable
blueprints fix the target word, grammar construct, reading topic, question
type, level, and balanced answer position before generation.

## Results

The first pass produced schema-valid results for 10/10 vocabulary questions,
8/10 ordering questions, and 9/10 reading questions. Schema validity was not
treated as sufficient. Manual review rejected eleven items across the first
pass and subsequent recovery candidates:

| Task                  | First-pass schema valid | Manual rejections | Final accepted |
| --------------------- | ----------------------: | ----------------: | -------------: |
| Vocabulary / idioms   |                   10/10 |                 2 |          10/10 |
| Sentence ordering     |                    8/10 |                 6 |          10/10 |
| Reading comprehension |                    9/10 |                 3 |          10/10 |

Rejected items were regenerated individually with construct-specific guidance,
then reviewed again. The final consolidated set contains 30 accepted items.

## Quality assessment

### Vocabulary and idioms

Gemma generally produces natural professional contexts and useful Japanese
explanations. Its principal weakness is semantic overlap: a distractor can be
a genuine synonym that also completes the sentence. Two items required
targeted exclusions (`limitation` beside `constraint`, and `rely upon` beside
`fall back on`). A curated distractor policy and semantic review remain
necessary before serving generated questions directly to learners.

### Sentence ordering

This was the weakest task. Gemma sometimes explains the requested rule
correctly while generating a sentence that tests a different construction or
is itself ungrammatical. Examples included the wrong causative pattern,
malformed it-cleft syntax, invalid inversion after `than`, and omitted commas
after introductory clauses. Deterministic chunk validation catches malformed
ordering data but cannot establish grammaticality. Production use should rely
on a curated grammar blueprint with positive and negative structural
constraints and a human-reviewed regression set.

### Reading comprehension

Passages were coherent, varied, level-appropriate, and usually supported one
clear answer. The observed defects were localized: a corrupted control token,
one unnatural word choice, and an inaccurate characterization of electricity
demand. Evidence-quote validation and topic-specific factual guardrails improve
reliability. A host-side answer-position transformation also needs to update
option labels in explanations; the harness now performs this migration.

## Decision

Gemma is suitable for local draft generation for all three task types, but the
raw output should not be published directly. Vocabulary and reading generation
are promising behind deterministic validation and selective review. Sentence
ordering needs the strongest safeguards and should initially use curated
grammar templates or a separately validated second-stage reviewer.

Run the suite and compile the latest accepted item for every blueprint:

```bash
node --import tsx local-model-evaluation/learning-task-suite.ts
node --import tsx local-model-evaluation/compile-learning-task-suite.ts
```

Raw prompts, responses, answer keys, and the consolidated reviewed set remain
under the gitignored `local-model-evaluation/artifacts/` directory.
