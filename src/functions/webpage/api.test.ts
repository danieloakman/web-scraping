import {api} from '.';
import { describe, expect, it } from 'bun:test';

// const tester = (method: 'api' | 'endpoint') => {
// 	if (method === 'api')
// 		return async (
// 			url: string,
// 			extraExpect: (res: Awaited<ReturnType<typeof api.call>>) => void
// 		) => {
// 			const res = await api.call({ url });
// 			extraExpect(res);
// 		};
// 	return async (url: string, extraExpect: (res: Awaited<ReturnType<typeof api.call>>) => void) => {
// 		const res = await callEndpoint(url);
// 		expect(res.status).toBe(200);
// 		extraExpect(res.data);
// 	};
// };
// const test = tester('api');

describe('parse/webpage', () => {
	it('parse webpage content', async () => {
		await api('https://www.woolworths.com.au/shop/recipes/mongolian-beef-stir-fry', (res) => {
			expect(res).toContain('Mongolian Beef Stir Fry');
		});

		// await test('https://vt.tiktok.com/ZSrDffvkb/', (res) => {
		// 	expect(res).toContain('Chicken Bacon Ranch');
		// });
	});
});
