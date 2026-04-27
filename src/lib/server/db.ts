import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Request-scoped factory. Never call at module top level — Cloudflare Workers
// reuse module scope across requests, and a leaked Neon client across an isolate
// boundary will eventually surface as stale-socket errors. Callers pass
// `platform.env` (in +server.ts / +page.server.ts) or an equivalent shape.
export function getDb(env: { DATABASE_URL: string }) {
	return drizzle(neon(env.DATABASE_URL));
}
