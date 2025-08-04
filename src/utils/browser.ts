import { type Browser, chromium as playwright, type LaunchOptions } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { exec, raise, Result } from '@danoaky/js-utils';

async function launchOptions({
	args = [],
	headless = true,
	...options
}: LaunchOptions = {}): Promise<LaunchOptions> {
	if (process.env.AWS_EXECUTION_ENV || process.env.SST_DEV) {
		return {
			args: [...chromium.args, ...args],
			executablePath: await chromium.executablePath(),
			headless: true, // Ignore headless option
			...options
		};
  }
	const { data: executablePath, error } = await exec('which google-chrome')
		.catch(() => exec('which chromium'))
		// @ts-expect-error - no types for chromium
		.catch(() => import('chromium').then((c: { path: string }) => Result.Ok(c.path)));
	if (error) throw new Error('No browser found');
	return {
		headless,
		args,
		executablePath,
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
