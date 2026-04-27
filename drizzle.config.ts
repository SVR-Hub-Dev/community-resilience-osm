/// <reference types="node" />
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// `wrangler dev` reads `.dev.vars` natively, but `drizzle-kit` runs in plain
// Node and does not. Loading it here keeps `npm run db:*` working from a
// clean shell with no extra wrapper.
config({ path: '.dev.vars' });

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DATABASE_URL!
	},
	strict: true,
	verbose: true
});
