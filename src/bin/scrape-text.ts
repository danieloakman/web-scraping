#! bun
import { extractText, getPageText } from '@/functions/webpage/utils';
import { launchBrowser, newPage, parseCookiesFile } from '@/utils/browser';
import meow from 'meow';
import { readFileSync, writeFileSync } from 'fs';
import { constant, Result } from '@danoaky/js-utils';
import { sleep } from 'bun';
import { readFile } from 'fs/promises';

if (import.meta.main) {
	const {
		input: urls,
		flags: { output, help, cookies: cookiesPath },
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

	await using browser = await launchBrowser();
	const context = await browser.newContext();
	await context.addCookies(cookies)

	const result: Record<string, string> = {};
	for (const url of urls) {
		console.log(`Scraping ${url} ...`);
		await using page = await newPage(context);
		await page.goto(url, { timeout: 10000 });
		// Check for a captcha that contains the text "confirm you are human"
		const captcha = await page.getByText('confirm you are human').first();
		if (await captcha.count().catch(constant(0))) {
			console.log('Captcha detected');
			await captcha.click();
		}
		while (true) {
			await sleep(5000);
			const captcha = page.getByText('confirm you are human').first();
			if (await captcha.count().catch(constant(0))) {
				console.log('Captcha detected');
				continue;
			} else {
				console.log('No captcha detected');
				break;
			}
		}
		const text = await getPageText(page);
		if (output) result[url] = text;
		else console.log(text + '\n\n');
	}
	if (output) writeFileSync(output, JSON.stringify(result, null, 2));
}
