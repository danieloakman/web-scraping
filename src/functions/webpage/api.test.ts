import { describe, expect, it } from 'bun:test';
import { api } from '.';
import { callWebpageEndpoint, getWebpageEndpointUrl } from '@/utils/sst-endpoint';

describe('parse/webpage', () => {
	it(
		'parse webpage content',
		async () => {
			const content = await api({ url: 'https://example.com' });
			expect(content).toContain('Example Domain');
		},
		{ timeout: 30_000 }
	);

	describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)('integration tests', () => {
		it.each([
			[
				'https://www.woolworths.com.au/shop/recipes/mongolian-beef-stir-fry',
				'Mongolian Beef Stir Fry'
			],
			['https://bulbapedia.bulbagarden.net/wiki/Weavile_(Pok%C3%A9mon)#Base_stats', 'Weavile'],
			['https://www.google.com', 'Google'],
			['https://www.recipetineats.com/easy-chocolate-brownies/', 'Easy Chocolate Brownies']
		])(
			'parse %s',
			async (url, expected) => {
				const content = await api({ url });
				expect(content).toContain(expected);
			},
			{ timeout: 30_000 }
		);
	});

	describe('webpage endpoint', () => {
		it.skipIf(!getWebpageEndpointUrl())(
			'calls the deployed SST webpage function',
			async () => {
				const content = await callWebpageEndpoint('https://example.com');
				expect(content).toContain('Example Domain');
			},
			{ timeout: 60_000 }
		);
	});
});
