import { launchBrowser, newPage } from '../utils/browser';
import { lambdaFn } from '../utils/api';
import * as Z from 'zod';

const INSTAGRAM_LOCATION_URL = 'https://www.instagram.com/explore/locations';

export const bodySchema = Z.object({
	route: Z.string()
		.optional()
		.meta({ description: 'Optional extra route to append to the base instagram locations url.' })
});

export const handler = lambdaFn(bodySchema, async () => {
	await using browser = await launchBrowser();
	await using page = await newPage(browser);
	await page.goto(INSTAGRAM_LOCATION_URL);
	const anchorSelectors = 'main ul a[href*="explore/locations"]';
	await page.waitForSelector(anchorSelectors);
	const anchors = await page.$$(anchorSelectors);
	const links = await Promise.all(
		anchors.map((anchor) => Promise.all([anchor.getAttribute('href'), anchor.innerText()] as const))
	);
	return links;
});
export default handler;
