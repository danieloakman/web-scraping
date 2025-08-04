import { launchBrowser, newPage } from '../utils/browser';
import { lambdaFn } from '../utils/api';
import * as Z from 'zod';
import Path from 'path';

const INSTAGRAM_LOCATION_URL = 'https://www.instagram.com/explore/locations';

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
export default api.handler;
