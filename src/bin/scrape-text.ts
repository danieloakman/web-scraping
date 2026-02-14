#! bun
import { extractText, getPageText } from '@/functions/webpage/utils';
import { launchBrowser, newPage, parseCookiesFile, passCaptcha } from '@/utils/browser';
import meow from 'meow';
import { readFileSync, writeFileSync } from 'fs';
import { constant, Result } from '@danoaky/js-utils';
import { sleep } from 'bun';
import { readFile } from 'fs/promises';

if (import.meta.main) {
	const {
		input: urls,
		flags: { output, help, cookies: cookiesPath, headless },
		showHelp
	} = meow(
		`Scrape the text from webpages.

  Usage:
    $ scrape-text <url>...

  Examples:
    $ scrape-text https://www.google.com
    $ scrape-text https://www.google.com https://www.bing.com`,
		{
			importMeta: import.meta,
			flags: {
				help: {
					type: 'boolean',
					default: false,
					shortFlag: 'h',
					description: 'Show help message and exit.'
				},
				output: {
					type: 'string',
					shortFlag: 'o',
					description:
						'The output json file path to write to. If not provided, the text will be written to the console.'
				},
				cookies: {
					type: 'string',
					shortFlag: 'c',
					description:
						'A path to a JSON file containing cookies array. Cookies should have at least name, value, and domain (or url) properties. If not provided, no cookies will be added.'
				},
				headless: {
					type: 'boolean',
					default: false,
					shortFlag: 'H',
					description: 'Run the browser in headless mode.'
				}
			}
		}
	);
	if (help) showHelp(0);
	if (!urls.length)
		throw new Error('No URLs provided');
	const { data: cookies, error: cookiesError } = cookiesPath
		? await parseCookiesFile(cookiesPath)
		: Result.Ok([]);
	if (cookiesError)
		throw new Error(`Failed to parse cookies: ${cookiesError.message}`);

	await using browser = await launchBrowser({ headless });
	const context = await browser.newContext();
	await context.addCookies(cookies)

	const result: Record<string, string> = {};
	for (const url of urls) {
		console.log(`Scraping ${url} ...`);
		await using page = await newPage(browser);
		await page.goto(url, { timeout: 10000 });
		await passCaptcha(page);
		const text = await getPageText(page);
		// const text = await page.innerHTML('body');
		if (output) result[url] = text;
		else console.log(text + '\n\n');
	}
	if (output) writeFileSync(output, JSON.stringify(result, null, 2));
}
