import { describe, it, expect } from 'vitest';
import { photoKey } from './r2';

describe('photoKey', () => {
	it('builds the inspection variant from §6.2', () => {
		const key = photoKey({
			kind: 'inspection',
			inspectionId: '00000000-0000-0000-0000-000000000001',
			slot: 'photo_1'
		});
		expect(key).toBe('inspections/00000000-0000-0000-0000-000000000001/photo_1.jpg');
	});

	it('builds the asset variant for non-inspection covers', () => {
		const key = photoKey({ kind: 'asset', assetRef: 'MVC-0042', slot: 'cover' });
		expect(key).toBe('assets/MVC-0042/cover.jpg');
	});
});
