import { type Browser, chromium as playwright, type LaunchOptions } from 'playwright-core';
import chromium from '@sparticuz/chromium';

async function launchOptions({
	args = [],
	headless = true,
	...options
}: LaunchOptions = {}): Promise<LaunchOptions> {
	if (process.env.AWS_EXECUTION_ENV) {
		return {
			args: [...chromium.args, ...args],
			executablePath: await chromium.executablePath(),
			headless: true,
			...options
		};
	}
	// const localChromium: { path: string } = await import('chromium');
	return {
		headless,
		args,
		// executablePath: localChromium.path,
		...options
	};
}

/**
 * Launches a browser with launch options handled internally for the most part.
 * @returns a browser instance that can be used with explicit resource management.
 * @example
 * ```ts
 * await using browser = await launchBrowser();
 * ```
 */
export async function launchBrowser(options: LaunchOptions = {}) {
	const browser = await playwright.launch(await launchOptions(options));
	return Object.assign(browser, {
		[Symbol.asyncDispose]: async () => {
			await browser.close();
		}
	});
}

/**
 * Creates a new page in the browser.
 * @returns a page instance that can be used with explicit resource management.
 * @example
 * ```ts
 * await using page = await newPage(browser);
 * ```
 */
export async function newPage(browser: Browser) {
	const page = await browser.newPage();
	return Object.assign(page, {
		[Symbol.asyncDispose]: async () => {
			await page.close();
		}
	});
}
