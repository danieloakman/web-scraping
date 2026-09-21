import { launchBrowser, launchBrowsers, newPage } from '../../utils/browser';
import { lambdaFn } from '../../utils/api';
import { cacheGet, cacheSet } from '../../utils/cache';
import * as Z from 'zod';
import Path from 'path';
import { attempt, constant, sleep, type PromiseOrValue } from '@danoaky/js-utils';
import type { Browser, Page } from 'playwright-core';
import type ExtendedIterator from 'iteragain/internal/ExtendedIterator';
import { iter } from 'iteragain';

const INSTAGRAM_BASE_URL = 'https://www.instagram.com';
const INSTAGRAM_LOCATION_URL = `${INSTAGRAM_BASE_URL}/explore/locations`;
const IG_APP_ID = '936619743392459';

/** Maps query tokens → Instagram country location ids. */
const COUNTRY_HINTS: Record<string, string> = {
	au: 'AU',
	australia: 'AU',
	nsw: 'AU',
	vic: 'AU',
	qld: 'AU',
	tas: 'AU',
	act: 'AU',
	nt: 'AU',
	nz: 'NZ',
	us: 'US',
	usa: 'US',
	uk: 'GB',
	gb: 'GB',
	ca: 'CA',
	canada: 'CA'
};

export type LocationUrl = [id: string, place: string];

export type LocationResult = {
	id: string;
	place: string;
	name: string;
	type: Location['type'];
	fullUrl: string;
	parentUrl?: string;
};

export class Location {
	/** Indicates the nested level of the location. Countries -> Regions -> Places. */
	readonly type: 'country' | 'region' | 'place';

	constructor(
		/** The id and place of the location. E.g. ["1234567890", "paris-france"] */
		public readonly url: LocationUrl,
		/** The actual human readable name of the location. E.g. "Paris, France" */
		public readonly name: string,
		/** The url route of the parent location. E.g. /explore/locations/US/ */
		public readonly parentUrl?: LocationUrl
	) {
		this.type = this.id.length === 2 ? 'country' : this.id.startsWith('c') ? 'region' : 'place';
	}

	static from(url: string, name: string, parentUrl?: string): Location {
		return new Location(this.parseUrl(url), name, parentUrl ? this.parseUrl(parentUrl) : undefined);
	}

	get id() {
		return this.url[0];
	}

	get place() {
		return this.url[1];
	}

	get fullUrl() {
		return `${INSTAGRAM_LOCATION_URL}/${this.url.join('/')}`;
	}

	get parent(): Location | undefined {
		if (!this.parentUrl) return undefined;
		return new Location(this.parentUrl, 'unknown', this.parentUrl);
	}

	toResult(): LocationResult {
		return {
			id: this.id,
			place: this.place,
			name: this.name,
			type: this.type,
			fullUrl: this.fullUrl,
			...(this.parentUrl ? { parentUrl: this.parentUrl.join('/') } : {})
		};
	}

	private static parseUrl(url: string): LocationUrl {
		if (url.startsWith('http')) {
			const { pathname } = new URL(url);
			const parts = pathname.split('/').filter((s) => !!s && s !== 'explore' && s !== 'locations');
			if (parts.length !== 2) throw new Error(`Invalid location url: ${url}`);
			return parts as LocationUrl;
		}
		const { pathname } = new URL(`${INSTAGRAM_BASE_URL}/${url}`);
		const parts = pathname.split('/').filter((s) => !!s && s !== 'explore' && s !== 'locations');
		if (parts.length === 2) return parts as LocationUrl;
		if (parts.length === 1) return [parts[0], ''] as LocationUrl;
		throw new Error(`Invalid location url: ${url}`);
	}
}

export function normalizeQuery(query: string): string {
	return query
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

export function tokenizeQuery(query: string): string[] {
	const normalized = normalizeQuery(query);
	return normalized ? normalized.split(' ') : [];
}

function slugInitials(slug: string): string {
	return slug
		.split('-')
		.map((part) => part[0] ?? '')
		.join('');
}

/** Word-boundary aware match so short tokens like "nsw" do not hit "brunswick". */
export function tokenMatchesLocation(location: Location, token: string): boolean {
	const name = location.name.toLowerCase();
	const place = location.place.toLowerCase();
	const id = location.id.toLowerCase();
	if (id === token || slugInitials(place) === token) return true;
	if (token.length <= 3) {
		const boundary = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, 'i');
		return boundary.test(name) || boundary.test(place.replace(/-/g, ' '));
	}
	return name.includes(token) || place.includes(token);
}

export function scoreLocation(location: Location, tokens: string[]): number {
	if (!tokens.length) return 0;
	let score = 0;
	for (const token of tokens) {
		const name = location.name.toLowerCase();
		const place = location.place.toLowerCase();
		if (name === token || place === token || place === `${token}-${place.split('-').at(-1)}`) {
			score += 10;
		} else if (tokenMatchesLocation(location, token)) {
			score += 5;
		}
	}
	return score;
}

function resolveCountryId(tokens: string[]): { countryId?: string; remaining: string[] } {
	const remaining: string[] = [];
	let countryId: string | undefined;
	for (const token of tokens) {
		const hint = COUNTRY_HINTS[token];
		if (hint && !countryId) {
			countryId = hint;
			continue;
		}
		remaining.push(token);
	}
	return countryId ? { countryId, remaining } : { remaining };
}

async function isOnLoginPage(page: Page) {
	const url = page.url();
	return url.includes('login');
}

export async function getLocations(
	browser: Browser,
	route = ''
): Promise<ExtendedIterator<Location>> {
	await using page = await newPage(browser);
	const url = Path.join(INSTAGRAM_LOCATION_URL, route);
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	const linkSelector = 'main li a[href*="explore/locations/"]';

	await page.waitForSelector(linkSelector).catch(constant(null));
	while (
		await page
			.getByText('See more')
			.count()
			.then((count) => count > 0)
			.catch(constant(false))
	) {
		console.log(`${page.url()}, clicking see more`);
		if (await page.getByText('See more').click().then(constant(false)).catch(constant(true))) break;
		await sleep(500);
	}

	if (await isOnLoginPage(page)) throw new Error(`Login page detected`);

	const links = await page.$$(linkSelector).catch(constant([]));
	const hrefs = await Promise.all(
		links.map((link) => link.evaluate((el) => [el.getAttribute('href'), el.textContent] as const))
	);
	return iter(hrefs)
		.unique({ iteratee: ([href]) => href })
		.filterMap(([href, name]) =>
			href && name ? Location.from(href, name, !route ? undefined : url) : null
		);
}

/**
 * Authenticated Instagram typeahead search (places only).
 * Requires `INSTAGRAM_SESSION_ID` (browser `sessionid` cookie).
 */
export async function searchLocationsTopsearch(
	browser: Browser,
	query: string
): Promise<LocationResult[] | null> {
	const sessionId = process.env.INSTAGRAM_SESSION_ID;
	if (!sessionId) return null;

	await using page = await newPage(browser);
	await page.context().addCookies([
		{
			name: 'sessionid',
			value: sessionId,
			domain: '.instagram.com',
			path: '/',
			httpOnly: true,
			secure: true
		}
	]);
	await page.goto(INSTAGRAM_BASE_URL, { waitUntil: 'domcontentloaded' });

	const payload = await page.evaluate(
		async ({ q, appId }) => {
			const url = `/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(q)}&include_reel=false&search_surface=web_top_search`;
			const res = await fetch(url, {
				headers: { 'x-ig-app-id': appId, accept: '*/*' },
				credentials: 'include'
			});
			const text = await res.text();
			return { status: res.status, text };
		},
		{ q: query, appId: IG_APP_ID }
	);

	if (payload.status !== 200) {
		console.warn(`topsearch returned ${payload.status}: ${payload.text.slice(0, 200)}`);
		return null;
	}

	const data = JSON.parse(payload.text) as {
		places?: Array<{
			place?: {
				title?: string;
				slug?: string;
				location?: { pk?: string | number; name?: string };
			};
		}>;
	};

	return (data.places ?? [])
		.map(({ place }) => {
			const id = place?.location?.pk != null ? String(place.location.pk) : undefined;
			const slug = place?.slug ?? '';
			const name = place?.title ?? place?.location?.name;
			if (!id || !name) return null;
			return Location.from(`${id}/${slug || id}`, name).toResult();
		})
		.filter((loc): loc is LocationResult => loc != null);
}

/**
 * Public directory scrape: resolve country → city/region → places for a free-text query.
 * Works without login. Best with a country/region hint (e.g. "Sydney NSW", "Paris France").
 */
export async function searchLocationsDirectory(
	browser: Browser,
	query: string
): Promise<LocationResult[]> {
	const tokens = tokenizeQuery(query);
	if (!tokens.length) return [];

	const { countryId, remaining } = resolveCountryId(tokens);
	const countries = [...(await getLocations(browser))];

	let country =
		(countryId ? countries.find((c) => c.id === countryId) : undefined) ??
		countries
			.map((c) => ({ c, score: scoreLocation(c, tokens) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)[0]?.c;

	if (!country) {
		throw new Error(
			`Could not resolve a country from query "${query}". Include a country or region hint (e.g. "Sydney NSW" or "Paris France"), or set INSTAGRAM_SESSION_ID for typeahead search.`
		);
	}

	const placeTokens = remaining.length ? remaining : tokens.filter((t) => COUNTRY_HINTS[t] == null);
	const children = [...(await getLocations(browser, country.url.join('/')))];

	const ranked = children
		.map((c) => ({ c, score: scoreLocation(c, placeTokens.length ? placeTokens : tokens) }))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score);

	const best = ranked[0]?.c;
	if (!best) {
		return children
			.filter((c) => placeTokens.every((t) => tokenMatchesLocation(c, t)))
			.map((c) => c.toResult());
	}

	// City/region pages list concrete Instagram places underneath.
	if (best.type === 'region' || best.type === 'country') {
		const places = [...(await getLocations(browser, best.url.join('/')))];
		const filtered = placeTokens.length
			? places.filter((p) => {
					// Keep all children of a strongly matched city (e.g. Sydney); only
					// re-filter when multiple place tokens remain beyond the city name.
					const unmatched = placeTokens.filter((t) => !tokenMatchesLocation(best, t));
					if (!unmatched.length) return true;
					return unmatched.every((t) => tokenMatchesLocation(p, t));
				})
			: places;
		return [best.toResult(), ...filtered.map((p) => p.toResult())];
	}

	return ranked.map(({ c }) => c.toResult());
}

export async function searchLocations(browser: Browser, query: string): Promise<LocationResult[]> {
	const fromTopsearch = await searchLocationsTopsearch(browser, query);
	if (fromTopsearch?.length) return fromTopsearch;
	return searchLocationsDirectory(browser, query);
}

export async function getAllLocations(
	callback: (locations: ExtendedIterator<Location>) => PromiseOrValue<void>,
	{
		headless = true,
		parallelBrowsers = 1,
		regionSearchCountries = [],
		retry = 2
	}: {
		headless?: boolean;
		parallelBrowsers?: number;
		/**
		 * If provided, only regions within the provided countries will be scraped.
		 * E.g. ['AU', 'NZ'] will only scrape regions within Australia and New Zealand.
		 */
		regionSearchCountries?: string[];
		retry?: number;
	} = {}
) {
	await using browsers = launchBrowsers(parallelBrowsers, { headless });
	const browser0 = await browsers[0]!().catch((err) => {
		console.log(err);
		throw new Error('Failed to launch browser');
	});
	const locations = [
		...(await getLocations(browser0)).map(
			(location) => [location, retry] as [location: Location, retry: number]
		)
	];
	await Promise.all(
		browsers.map(async (getBrowser, browserIdx) => {
			const browser = await getBrowser();
			while (locations.length) {
				let value = locations.pop();
				if (!value) continue;
				const [location, retry] = value;
				console.log(
					`stack size: ${locations.length}, browser[${browserIdx}], goto: ${location.fullUrl}`
				);
				const { data: result, error } = await attempt(
					getLocations(browser, location.url.join('/'))
				);
				if (error) {
					locations.unshift([location, retry - 1]); // Put to the back of the queue
					continue;
				}
				await callback(
					result
						.tap((location) => {
							if (
								location.type === 'region' &&
								regionSearchCountries.includes(location.parent?.id ?? '')
							)
								locations.push([location, retry]);
						})
						.prepend([location])
				);
			}
		})
	);
}

export const api = lambdaFn(
	Z.object({
		query: Z.string()
			.min(1)
			.meta({ description: 'Free-text location search, e.g. "Sydney NSW".' })
	}),
	async ({ query }) => {
		const cacheKey = normalizeQuery(query);
		const cached = await cacheGet<LocationResult[]>(cacheKey);
		if (cached) {
			console.log(`cache hit: ${cacheKey}`);
			return cached;
		}

		await using browser = await launchBrowser();
		const locations = await searchLocations(browser, query);
		await cacheSet(cacheKey, locations);
		return locations;
	}
);
export const handler = api.handler;
