import type { Pool } from 'pg';

export interface SessionStore {
  get(key: string): Promise<number | undefined>;
  set(key: string, expires: number): Promise<void>;
  delete(key: string): Promise<void>;
  prune(now: number): Promise<void>;
}

// Local development/tests only. Production must supply persistent storage.
export function createMemorySessionStore(): SessionStore {
  const entries = new Map<string, number>();
  return {
    async get(key) { return entries.get(key); },
    async set(key, expires) { entries.set(key, expires); },
    async delete(key) { entries.delete(key); },
    async prune(now) { for (const [key, expires] of entries) if (expires <= now) entries.delete(key); },
  };
}

export function createPostgresSessionStore(database: Pick<Pool, 'query'>): SessionStore {
  return {
    async get(key) {
      const result = await database.query<{ expires_at: Date }>('SELECT expires_at FROM panel_sessions WHERE token_hash = $1', [key]);
      return result.rows[0]?.expires_at.getTime();
    },
    async set(key, expires) {
      await database.query('INSERT INTO panel_sessions (token_hash, expires_at) VALUES ($1, $2)', [key, new Date(expires)]);
    },
    async delete(key) { await database.query('DELETE FROM panel_sessions WHERE token_hash = $1', [key]); },
    async prune(now) { await database.query('DELETE FROM panel_sessions WHERE expires_at <= $1', [new Date(now)]); },
  };
}
