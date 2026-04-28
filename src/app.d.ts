// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}

	// `wrangler types` regenerates Cloudflare.Env from .dev.vars, which means
	// any secret a developer hasn't yet copied into their local .dev.vars
	// disappears from the typed Env. The R2 S3-signing secrets (.dev.vars.example
	// documents them) are required at runtime by getPresignedPhotoUrl; declare
	// them here so the types are stable regardless of local .dev.vars state.
	// Interface merging is safe — once they appear in worker-configuration.d.ts
	// the duplicate declarations have identical types.
	namespace Cloudflare {
		interface Env {
			R2_ACCOUNT_ID: string;
			R2_ACCESS_KEY_ID: string;
			R2_SECRET_ACCESS_KEY: string;
		}
	}
}

export {};
