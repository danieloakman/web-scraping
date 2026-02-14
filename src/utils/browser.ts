import { type Browser, chromium as playwright, type LaunchOptions, type Page, type Cookie, type BrowserContext } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { attempt, clamp, once, Result } from '@danoaky/js-utils';
import { readFile } from 'fs/promises';
import * as Z from 'zod';

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

export function launchBrowsers(
	count: number,
	options: LaunchOptions
): (() => Promise<Browser>)[] & AsyncDisposable {
	const browsers = Array.from({ length: clamp(count, 1, Infinity) }, () =>
		once(async () => playwright.launch(await launchOptions(options)))
	);
	return Object.assign(browsers, {
		[Symbol.asyncDispose]: async () => {
			await Promise.all(
				browsers.map((getBrowser) => getBrowser().then((b) => b.close().catch(() => null)))
			);
		}
	}) as (() => Promise<Browser>)[] & AsyncDisposable;
}

/**
 * Creates a new page in the browser.
 * @returns a page instance that can be used with explicit resource management.
 * @example
 * ```ts
 * await using page = await newPage(browser);
 * ```
 */
export async function newPage(browser: Browser | BrowserContext) {
	const page = await browser.newPage();
	return Object.assign(page, {
		[Symbol.asyncDispose]: async () => {
			await page.close();
		}
	});
}

const SAME_SITE_MAP: Record<string, Cookie['sameSite']> = {
	'lax': 'Lax',
	'strict': 'Strict',
	'none': 'None',
	'unspecified': 'None',
	'no_restriction': 'None',
}

export const cookiesSchema = Z.array(Z.object({
	name: Z.string(),
	value: Z.string(),
	domain: Z.string(),
	path: Z.string().default('/'),
	expires: Z.number().optional(),
	expirationDate: Z.number().optional(),
	httpOnly: Z.boolean().default(false),
	secure: Z.boolean().default(false),
	sameSite: Z.string().transform((s, ctx) => {
		const value = SAME_SITE_MAP[s];
		if (!value) {
			ctx.addIssue({
				code: 'invalid_value',
				values: Object.keys(SAME_SITE_MAP),
				input: s,
				continue: false,
				message: 'Invalid sameSite value',
			});
			return Z.NEVER;
		}
		return value;
	})
}).transform(({ expires, expirationDate, ...rest }) => ({
	...rest,
	// expires: Math.floor(expirationDate ?? expires ?? Date.now() + 1000 * 60 * 60 * 24 * 30),
	expires: Math.floor(Date.now() / 1000 + 365 * 24 * 60 * 60), // unix timestamp in seconds, year from now
})))

export async function parseCookiesFile(path: string): Promise<Result<Cookie[], Error>> {
	const content = await readFile(path, 'utf-8');
	return attempt(() => {
		const parsed = JSON.parse(content.trim());
		return cookiesSchema.parse(parsed);
	});
}

export async function passCaptcha(page: Page) {
	// Check for Cloudflare challenge first
	const cloudflareSelectors = [
		'iframe[src*="challenges.cloudflare.com"]',
		'iframe[src*="cloudflare"]',
		'#challenge-stage',
		'#challenge-container',
		'[data-ray]', // Cloudflare challenge pages often have data-ray attributes
	];

	// Check for Cloudflare challenge indicators
	let isCloudflareChallenge = false;
	for (const selector of cloudflareSelectors) {
		try {
			const element = await page.$(selector);
			if (element) {
				isCloudflareChallenge = true;
				break;
			}
		} catch (e) {
			// Continue
		}
	}

	// Also check for Cloudflare challenge text
	if (!isCloudflareChallenge) {
		const pageContent = await page.content();
		if (pageContent.includes('Help us keep') && pageContent.includes('secure') &&
			(pageContent.includes('_cf_chl_opt') || pageContent.includes('challenges.cloudflare.com'))) {
			isCloudflareChallenge = true;
		}
	}

	if (isCloudflareChallenge) {
		// Try to find and click Cloudflare challenge checkbox/button
		const cloudflareCheckboxSelectors = [
			'iframe[src*="challenges.cloudflare.com"]',
			'iframe[src*="turnstile"]',
			'[data-sitekey]', // Turnstile widget
			'.cf-turnstile',
		];

		let cloudflareFrame = null;
		for (const selector of cloudflareCheckboxSelectors) {
			try {
				const frameElement = await page.$(selector);
				if (frameElement) {
					const frame = await frameElement.contentFrame();
					if (frame) {
						cloudflareFrame = frame;
						break;
					}
				}
			} catch (e) {
				// Continue
			}
		}

		// Try clicking in iframe first
		if (cloudflareFrame) {
			try {
				const checkbox = await cloudflareFrame.$('input[type="checkbox"]') ||
					await cloudflareFrame.$('[role="checkbox"]') ||
					await cloudflareFrame.$('label');
				if (checkbox) {
					await checkbox.click();
				}
			} catch (e) {
				// Continue to direct selectors
			}
		}

		// Also try clicking directly on the challenge container
		try {
			const challengeContainer = await page.$('#ehurV4');
			if (challengeContainer) {
				// Look for clickable elements inside
				const clickable = await challengeContainer.$('input[type="checkbox"], [role="checkbox"], button, label');
				if (clickable) {
					await clickable.click();
				}
			}
		} catch (e) {
			// Continue
		}

		// Wait for Cloudflare challenge to complete
		// Look for success message or disappearance of challenge elements
		try {
			await page.waitForFunction(
				() => {
					// Check for success message (id contains "UwjU7" or similar)
					const successElements = Array.from(document.querySelectorAll('[id]'));
					const successMsg = successElements.find(el => {
						const htmlEl = el as HTMLElement;
						return el.textContent?.includes('Verification successful') ||
							(el.textContent?.includes('Waiting for') && htmlEl.style.display !== 'none');
					}) as HTMLElement | undefined;
					if (successMsg && successMsg.style.display !== 'none') {
						return true;
					}
					// Check if challenge container is gone or hidden
					const challenge = document.querySelector('#ehurV4') as HTMLElement | null;
					if (!challenge || challenge.style.display === 'none') {
						return true;
					}
					// Check if loading spinner is gone
					const loading = document.querySelector('#aulk2, .loading-verifying') as HTMLElement | null;
					if (loading && (loading.style.display === 'none' || loading.style.visibility === 'hidden')) {
						return true;
					}
					// Check if we're no longer on a challenge page (URL changed or challenge elements removed)
					const challengeText = document.body.textContent || '';
					if (!challengeText.includes('Help us keep') && !challengeText.includes('confirm you are human')) {
						return true;
					}
					return false;
				},
				{ timeout: 60000 }
			).catch(() => {
				// Challenge might take longer or require manual intervention
			});

			// Wait a bit more for page to respond
			await page.waitForTimeout(3000);
			return;
		} catch (e) {
			// Continue to reCAPTCHA handling
		}
	}

	// Common captcha checkbox selectors (primarily for reCAPTCHA)
	const captchaSelectors = [
		'iframe[src*="recaptcha"]',
		'iframe[title*="reCAPTCHA"]',
		'iframe[title*="recaptcha"]',
		'.g-recaptcha iframe',
		'#recaptcha iframe',
	];

	// Try to find a captcha iframe
	let captchaFrame = null;
	for (const selector of captchaSelectors) {
		try {
			const frameElement = await page.$(selector);
			if (frameElement) {
				const frame = await frameElement.contentFrame();
				if (frame) {
					captchaFrame = frame;
					break;
				}
			}
		} catch (e) {
			// Continue to next selector
		}
	}

	// If no iframe found, try direct checkbox selectors
	if (!captchaFrame) {
		const directSelectors = [
			'#recaptcha-anchor',
			'.recaptcha-checkbox',
			'[aria-label*="recaptcha" i]',
		];

		for (const selector of directSelectors) {
			try {
				const checkbox = await page.$(selector);
				if (checkbox) {
					await checkbox.click();
					// Wait for captcha to be resolved
					await page.waitForFunction(
						() => {
							const anchor = document.querySelector('#recaptcha-anchor');
							return anchor?.getAttribute('aria-checked') === 'true';
						},
						{ timeout: 30000 }
					).catch(() => {
						// If the function times out, the captcha might already be resolved
					});
					return;
				}
			} catch (e) {
				// Continue to next selector
			}
		}

		// No captcha found
		return;
	}

	// Click the checkbox inside the iframe
	try {
		const checkbox = await captchaFrame.$('#recaptcha-anchor');
		if (checkbox) {
			await checkbox.click();

			// Wait for the captcha to be resolved by checking the checkbox state in the frame
			await captchaFrame.waitForFunction(
				() => {
					const anchor = document.querySelector('#recaptcha-anchor');
					return anchor?.getAttribute('aria-checked') === 'true';
				},
				{ timeout: 30000 }
			).catch(() => {
				// If timeout, captcha might already be resolved or require manual intervention
			});

			// Additional wait to ensure any challenge popup is gone
			await page.waitForTimeout(2000);
		}
	} catch (e) {
		// Captcha checkbox not found or already resolved
	}
}