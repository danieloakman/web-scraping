import { chromium as playwright, type LaunchOptions } from 'playwright-core';
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

export async function launchBrowser(options: LaunchOptions = {}) {
	const browser = await playwright.launch(await launchOptions(options));
	return Object.assign(browser, {
		[Symbol.asyncDispose]: async () => {
			await browser.close();
		}
	});
}
