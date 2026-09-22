import { describe, expect, it } from 'bun:test';
import {
	Location,
	isGraphLocationCandidate,
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

	it('toGraphResult returns null for short pk and geonames ids', () => {
		const shortPk = Location.from('/explore/locations/214737000/surfers-paradise/', 'Surfers');
		const geonames = Location.from('/explore/locations/c114925/sydney-australia/', 'Sydney');
		expect(shortPk.toGraphResult()).toBeNull();
		expect(geonames.toGraphResult()).toBeNull();
	});

	it('toGraphResult returns graphLocationId for page-shaped ids', () => {
		const location = Location.from(
			'/explore/locations/102771511673021/meriton-suites/',
			'Meriton Suites'
		);
		expect(location.toGraphResult('Surfers Paradise')).toEqual({
			graphLocationId: '102771511673021',
			name: 'Meriton Suites',
			parentName: 'Surfers Paradise',
			fullUrl: 'https://www.instagram.com/explore/locations/102771511673021/meriton-suites'
		});
	});
});

describe('isGraphLocationCandidate', () => {
	it('rejects short pks, geonames, and non-digits', () => {
		expect(isGraphLocationCandidate('214737000')).toBe(false);
		expect(isGraphLocationCandidate('c114925')).toBe(false);
		expect(isGraphLocationCandidate('AU')).toBe(false);
		expect(isGraphLocationCandidate('12345678901')).toBe(false); // 11 digits
	});

	it('accepts digit ids with length >= 12', () => {
		expect(isGraphLocationCandidate('102771511673')).toBe(true); // 12
		expect(isGraphLocationCandidate('106281374730692')).toBe(true);
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
