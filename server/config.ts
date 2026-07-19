import { z } from 'zod';

const reasoningEfforts = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;
const assessmentModes = ['live', 'dry-run'] as const;

const environmentSchema = z.object({
  AI_BRIDGE_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  AI_ALLOWED_ORIGINS: z.string().min(1),
  AI_ALLOWED_EMAILS: z.string().min(1),
  ASSESSMENT_MODE: z.enum(assessmentModes).default('live'),
  AI_GENERATION_REPAIR_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(0)
    .max(4)
    .default(2),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  CODEX_MODEL: z.string().min(1).optional(),
  CODEX_REASONING_EFFORT: z.enum(reasoningEfforts).default('high'),
});

export type ServerConfig = {
  port: number;
  allowedOrigins: ReadonlySet<string>;
  allowedEmails: ReadonlySet<string>;
  repairAttempts: number;
  assessmentMode: (typeof assessmentModes)[number];
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseSecretKey: string;
  codexModel?: string;
  codexReasoningEffort: (typeof reasoningEfforts)[number];
};

export function readServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid AI bridge configuration:\n${details}`);
  }

  return {
    port: parsed.data.AI_BRIDGE_PORT,
    allowedOrigins: parseCsv(parsed.data.AI_ALLOWED_ORIGINS),
    allowedEmails: parseCsv(parsed.data.AI_ALLOWED_EMAILS, true),
    repairAttempts: parsed.data.AI_GENERATION_REPAIR_ATTEMPTS,
    assessmentMode: parsed.data.ASSESSMENT_MODE,
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseAnonKey: parsed.data.SUPABASE_ANON_KEY,
    supabaseSecretKey: parsed.data.SUPABASE_SECRET_KEY,
    codexModel: parsed.data.CODEX_MODEL,
    codexReasoningEffort: parsed.data.CODEX_REASONING_EFFORT,
  };
}

function parseCsv(value: string, lowercase = false): ReadonlySet<string> {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (lowercase ? entry.toLowerCase() : entry));
  return new Set(entries);
}
