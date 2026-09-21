import { describe, expect, it } from 'bun:test';
import {
	Location,
	normalizeQuery,
	scoreLocation,
	tokenMatchesLocation,
	tokenizeQuery
} from '.';

describe('Location', () => {
	it('parses a country location from a relative path', () => {
		const location = Location.from('/explore/locations/US/united-states/', 'United States');
		expect(location.id).toBe('US');
		expect(location.place).toBe('united-states');
		expect(location.name).toBe('United States');
		expect(location.type).toBe('country');
		expect(location.fullUrl).toBe('https://www.instagram.com/explore/locations/US/united-states');
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

	it('serializes to a plain result object', () => {
		const location = Location.from('/explore/locations/c114925/sydney-australia/', 'Sydney');
		expect(location.toResult()).toEqual({
			id: 'c114925',
			place: 'sydney-australia',
			name: 'Sydney',
			type: 'region',
			fullUrl: 'https://www.instagram.com/explore/locations/c114925/sydney-australia'
		});
	});
});

describe('query matching', () => {
	it('normalizes and tokenizes queries', () => {
		expect(normalizeQuery('  Sydney,  NSW ')).toBe('sydney nsw');
		expect(tokenizeQuery('Sydney NSW')).toEqual(['sydney', 'nsw']);
	});

	it('does not treat nsw as a substring of brunswick', () => {
		const brunswick = Location.from(
			'/explore/locations/c107764/brunswick-australia/',
			'Brunswick'
		);
		expect(tokenMatchesLocation(brunswick, 'nsw')).toBe(false);
	});

	it('scores sydney highly for sydney tokens', () => {
		const sydney = Location.from('/explore/locations/c114925/sydney-australia/', 'Sydney');
		expect(scoreLocation(sydney, ['sydney'])).toBeGreaterThan(0);
		expect(scoreLocation(sydney, ['melbourne'])).toBe(0);
	});
});
