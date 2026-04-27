// Server-only. Never import from a client component or `+page.svelte`.
// Writes go through the R2 binding (`platform.env.PHOTOS_BUCKET`); presigned
// read URLs are signed against the R2 S3-compatible endpoint per
// architecture §8.2 / §8.3.

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type PhotoKeyInput =
	| { kind: 'inspection'; inspectionId: string; slot: string }
	| { kind: 'asset'; assetRef: string; slot: string };

export function photoKey(input: PhotoKeyInput): string {
	switch (input.kind) {
		case 'inspection':
			return `inspections/${input.inspectionId}/${input.slot}.jpg`;
		case 'asset':
			return `assets/${input.assetRef}/${input.slot}.jpg`;
	}
}

export async function putPhoto(
	bucket: R2Bucket,
	key: string,
	body: ReadableStream | ArrayBuffer | Blob,
	contentType: string
): Promise<string> {
	await bucket.put(key, body, {
		httpMetadata: { contentType }
	});
	return key;
}

export interface R2SigningEnv {
	R2_ACCOUNT_ID: string;
	R2_ACCESS_KEY_ID: string;
	R2_SECRET_ACCESS_KEY: string;
}

export async function getPresignedPhotoUrl(
	env: R2SigningEnv,
	key: string,
	ttlSeconds = 300
): Promise<string> {
	const client = new S3Client({
		region: 'auto',
		endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: env.R2_ACCESS_KEY_ID,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY
		}
	});

	const command = new GetObjectCommand({ Bucket: 'photos', Key: key });
	return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}
