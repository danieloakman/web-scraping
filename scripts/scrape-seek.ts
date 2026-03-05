import { Browser, BrowserContext, Page } from 'playwright-core';
import { launchBrowser, newPage, parseCookiesFile } from '../src/utils/browser';
import meow from 'meow';
import { deferral } from '@danoaky/js-utils/disposables';
import { $ } from 'bun';
import { existsSync } from 'fs';
import { iter } from 'iteragain';

const AUTH_FILE = '/tmp/auth.json';
const OUTPUT_FILE = '/tmp/seek-jobs.json';
// async function loadCookies(page: Page, cookiesPath: string) {
//   if (!cookiesPath) return;
//   const { data: cookies, error } = await parseCookiesFile(cookiesPath);
//   if (error) {
//     console.error(`Failed to load cookies: ${error.message}`);
//     return;
//   }
//   const ctx = page.context();
//   await ctx.addCookies(cookies);
//   await ctx.storageState({ path: AUTH_FILE });
// }

export async function scrapeSeekJobSearch(ctx: Browser | BrowserContext, url: string) {
	console.log(`Scraping ${url}`);
	await using page = await newPage(ctx);
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
	const links = await page.locator('a[href*="/job/"]').all();

	// TODO: use the /job/[ID] to check if the job has already been scraped
	const results = new Map<string, { href: string; content: string }>();
	for (const link of links) {
		const href = await link.getAttribute('href');
		if (!href) {
			console.error(`No href found for job link: ${link}`);
			continue;
		} else if (results.has(href)) {
			continue;
		}
		await using jobPage = await newPage(ctx);
		await jobPage.goto('https://www.seek.com.au' + href, {
			waitUntil: 'domcontentloaded',
			timeout: 10000
		});
		const content = await jobPage.textContent('body', { timeout: 10000 });
		if (!content) continue;
		results.set(href, { href, content });
	}

	return results;
}

if (import.meta.main) {
	const {
		flags: { headless, authfile, help, output },
		input: urls,
		showHelp
	} = meow(
		`
    Usage
    $ scrape-seek [options] <urls...>

    Options
    --help, -h        Show help
    --headless    Whether to run the browser in headless mode
    --authfile, -a     Path to a auth file to load (default: ${AUTH_FILE})
		--output, -o     Path to a output file to save the results (default: ${OUTPUT_FILE})
  `.trimStart(),
		{
			importMeta: import.meta,
			flags: {
				help: {
					type: 'boolean',
					default: false
				},
				headless: {
					type: 'boolean',
					default: false
				},
				authfile: {
					type: 'string',
					default: AUTH_FILE
				},
				output: {
					type: 'string',
					default: OUTPUT_FILE
				}
			}
		}
	);
	if (help) showHelp(0);
	if (!existsSync(authfile)) await $`echo '{}' > ${authfile}`;

	await using browser = await launchBrowser({ headless });
	const context = await browser.newContext({ storageState: authfile });
	await using defer = deferral();
	defer(async () => {
		await context.storageState({ path: authfile });
		await context.close();
	});
	const results: { href: string; content: string }[] = [];
	for (const url of urls) {
		results.push(...(await scrapeSeekJobSearch(context, url)));
	}
	await Bun.write(output, JSON.stringify(results, null, 2));
}
