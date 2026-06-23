import { describe, expect, it } from 'bun:test';
import { Location } from '.';

describe('Location', () => {
	it('parses a country location from a relative path', () => {
		const location = Location.from('/explore/locations/US/united-states/', 'United States');
		expect(location.id).toBe('US');
		expect(location.place).toBe('united-states');
		expect(location.name).toBe('United States');
		expect(location.type).toBe('country');
		expect(location.fullUrl).toBe(
			'https://www.instagram.com/explore/locations/US/united-states'
		);
	});

	it('parses a region location', () => {
		const location = Location.from(
			'/explore/locations/c12345678/new-south-wales/',
			'New South Wales',
			'/explore/locations/AU/australia/'
		);
		expect(location.type).toBe('region');
		expect(location.parent?.id).toBe('AU');
	});
});
