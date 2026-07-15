import type { Database } from '@/types/database';

export type Note = Database['public']['Tables']['notes']['Row'];
export type NewNote = Database['public']['Tables']['notes']['Insert'];
