import { launchBrowser, launchBrowsers, newPage } from '../../utils/browser';
import { lambdaFn } from '../../utils/api';
import * as Z from 'zod';
import Path from 'path';
import { constant, sleep, type PromiseOrValue } from '@danoaky/js-utils';
import type { Browser, Page } from 'playwright-core';
import type ExtendedIterator from 'iteragain/internal/ExtendedIterator';
import { iter } from 'iteragain';

const INSTAGRAM_LOCATION_URL = 'https://www.instagram.com/explore/locations';

type LocationUrl = [id: string, place: string];
class Location {
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

	private static parseUrl(url: string): LocationUrl {
		if (url.startsWith('http')) {
			const { pathname } = new URL(url);
			const parts = pathname.split('/').filter((s) => !!s && s !== 'explore' && s !== 'locations');
			if (parts.length !== 2) throw new Error(`Invalid location url: ${url}`);
			return parts as LocationUrl;
		}
		const parts = url.split('/').filter((s) => !!s && s !== 'explore' && s !== 'locations');
		if (parts.length === 2) return parts as LocationUrl;
		if (parts.length === 1) return [parts[0], ''] as LocationUrl;
		throw new Error(`Invalid location url: ${url}`);
	}
}

const clickNavigation = async (page: Page, textSearch: string, selector: string) => {
	const elements = await page.$$(selector);
	for (const element of elements) {
		const text = await element.evaluate((el) => el.textContent);
		if (text?.includes(textSearch)) {
			// Check if element is still attached to the DOM and is clickable
			const isAttached = await element.evaluate((el) => el.isConnected);
			if (!isAttached) continue;
			console.log(`${page.url()}, Clicking: "${text}"`);
			return element
				.click()
				.then(constant(true))
				.catch((err) => {
					console.error(err);
					return false;
				});
		}
	}
	return false;
};

async function isOnLoginPage(page: Page) {
	const url = page.url();
	return url.includes('login');
}

/** TODO: use this function */
async function getLocations(browser: Browser, route = ''): Promise<ExtendedIterator<Location>> {
  await using page = await newPage(browser);
	const url = Path.join(INSTAGRAM_LOCATION_URL, route);
	await page.goto(url);
	while (await clickNavigation(page, 'See more', 'a[href*="page"]')) {
    await sleep(500);
	}

	if (await isOnLoginPage(page)) throw new Error('Login page detected');

	const links = await page.$$('main li a[href*="explore/locations/"]');
	const hrefs = await Promise.all(
		links.map((link) => link.evaluate((el) => [el.getAttribute('href'), el.textContent] as const))
	);
	return iter(hrefs)
		.unique({ iteratee: ([href]) => href })
		.filterMap(([href, name]) =>
			href && name
				? Location.from(href, name, !route ? undefined : url)
				: null
		);
}

/** Only scrap places in australia for now, otherwise all else just get up to the region level. */
// const ALLOWED_COUNTRY_CODES = ['AU'];
async function getAllLocations(
  callback: (locations: ExtendedIterator<Location>) => PromiseOrValue<void>,
  {
    headless = true,
    parallelBrowsers = 1,
    skipUrl = constant(false),
  }: {
    headless?: boolean;
    parallelBrowsers?: number;
    skipUrl?: (url: string) => PromiseOrValue<boolean>;
  } = {},
) {
  await using browsers = await launchBrowsers(parallelBrowsers, { headless });
  const browser0 = await browsers[0]!();
  const locations = [...(await getLocations(browser0, INSTAGRAM_LOCATION_URL))];
  await Promise.all(
    browsers.map(async (getBrowser, browserIdx) => {
      const browser = await getBrowser();
      while (locations.length) {
        const location = locations.pop();
        if (!location) continue;
        if (await skipUrl(location.fullUrl)) {
          console.log(`skipping ${location.fullUrl}`);
          continue;
        }
        console.log(`${locations.length} locations left on the stack`);
        console.log(`browser[${browserIdx}], goto: ${location.fullUrl}`);
        const result = await getLocations(browser, location.fullUrl);
        await callback(
          result
          //   .tap((location) => {
          //   if (
          //     location.type === 'region' &&
          //     ALLOWED_COUNTRY_CODES.includes(location.parent?.id ?? '')
          //   )
          //     locations.push(location);
          // }),
        );
      }
    }),
  );
}

export const api = lambdaFn(
	Z.object({
		route: Z.string()
			.optional()
			.meta({ description: 'Optional extra route to append to the base instagram locations url.' })
	}).optional(),
	async (body) => {
		const { route = '' } = body ?? {};
		await using browser = await launchBrowser();
		await using page = await newPage(browser);
		const url = Path.join(INSTAGRAM_LOCATION_URL, route ?? '');
		console.debug(url);
		await page.goto(url);
		const anchorSelectors = 'main ul a[href*="explore/locations"]';
		await page.waitForSelector(anchorSelectors);
		const anchors = await page.$$(anchorSelectors);
		const links = await Promise.all(
			anchors.map((anchor) =>
				Promise.all([anchor.getAttribute('href'), anchor.innerText()] as const)
			)
		);
		return links;
	}
);
export const handler = api.handler;
