import { type Browser, chromium as playwright, type LaunchOptions } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { clamp, once } from '@danoaky/js-utils';

async function launchOptions({
	args = [],
  headless = true,
	...options
}: LaunchOptions = {}): Promise<LaunchOptions> {
  if (process.env.AWS_EXECUTION_ENV) {
    // On AWS lambda
		return {
			args: [...chromium.args, ...args],
			executablePath: await chromium.executablePath(),
			headless: true, // Ignore headless option
			...options
		};
  }
	return {
		headless,
    args,
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

export async function launchBrowsers(count: number, options: LaunchOptions) {
  const browsers = Array.from({ length: clamp(count, 1, Infinity) }, () =>
    once(async () => playwright.launch(await launchOptions(options))),
  );
  return Object.assign(browsers, {
    [Symbol.asyncDispose]: async () => {
      await Promise.all(
        browsers.map((getBrowser) => getBrowser().then((b) => b.close().catch(() => null))),
      );
    },
  });
};

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
