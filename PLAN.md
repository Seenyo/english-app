# Adaptive placement assessment — implementation plan

## Confirmed product decisions

- Private, single-owner application; multiple owned Google accounts are test personas.
- Codex SDK uses the owner's saved ChatGPT Plus/Pro login; no OpenAI API key.
- Japanese adult learner; self-description may be Japanese or English.
- Optional Eiken grade and TOEIC score.
- Scope: vocabulary, idioms, and grammar.
- Format: natural English sentence completion, four English choices plus “I don't know”.
- Three adaptive rounds: 10, 10, and 5 questions.
- No timer. Selecting saves immediately and advances; Back permits correction.
- Retake interval: 30 days.
- Detailed result after all 25 questions, with a score after each round.

## Generation contract

Round composition:

| Round | Vocabulary | Idiom | Grammar | Calibration                      |
| ----- | ---------: | ----: | ------: | -------------------------------- |
| 1     |          4 |     3 |       3 | Broad range around self-report   |
| 2     |          4 |     3 |       3 | Narrowed using Round 1           |
| 3     |          2 |     1 |       2 | Boundary-focused final questions |

Each placement attempt owns one Codex thread. Round 2 and Round 3 resume that
thread. Every response is constrained by JSON Schema and then independently
checked for exact counts, category mix, one blank, unique ordered options, and
strictly increasing difficulty within each category.

If parsing or validation fails, the bridge sends the exact validation issues to
the same thread and requests a complete replacement. It allows two automatic
repairs by default. Exhaustion produces a persisted retryable state and retains
the resumable thread ID.

## Delivery steps

- [x] Codex SDK structured-output spike with real ChatGPT authentication
- [x] Same-thread parse/validation repair loop and tests
- [x] Supabase schema and server-only answer-key separation
- [x] Deterministic round scoring and CEFR estimate
- [x] Owner email allowlist and JWT validation
- [x] Profile, question, round result, final result, and dashboard UI
- [x] Responsive design and reduced-motion/keyboard behavior
- [x] CI test gate
- [x] Apply the migration to the Supabase project
- [x] Add `.env.server` private values
- [ ] Complete a real 25-question browser smoke test
