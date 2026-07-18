import type { IncomingMessage } from 'node:http';
import { createClient, type User } from '@supabase/supabase-js';
import type { ServerConfig } from '../config.ts';
import { HttpError } from '../http/errors.ts';

export type AuthorizeRequest = (request: IncomingMessage) => Promise<User>;

export function createRequestAuthorizer(
  config: Pick<
    ServerConfig,
    'supabaseUrl' | 'supabaseAnonKey' | 'allowedEmails'
  >,
): AuthorizeRequest {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return async (request) => {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : '';
    if (!token) {
      throw new HttpError(
        401,
        'A Supabase session is required.',
        'unauthorized',
      );
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new HttpError(
        401,
        'The Supabase session is invalid.',
        'unauthorized',
      );
    }

    const email = data.user.email?.toLowerCase();
    if (!email || !config.allowedEmails.has(email)) {
      throw new HttpError(
        403,
        'This Google account is not allowed to use the personal AI bridge.',
        'account_not_allowed',
      );
    }
    return data.user;
  };
}
