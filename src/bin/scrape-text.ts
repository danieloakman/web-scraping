#! bun
import { extractText, getPageText } from '@/functions/webpage/utils';
import { launchBrowser, newPage } from '@/utils/browser';
import meow from 'meow';
import { writeFileSync } from 'fs';
import { constant } from '@danoaky/js-utils';
import { sleep } from 'bun';

if (import.meta.main) {
	const {
		input: urls,
		flags: { output, help },
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
					default: '',
					shortFlag: 'o',
					description:
						'The output json file path to write to. If not provided, the text will be written to the console.'
				}
			}
		}
	);
	if (help) showHelp(0);
	if (!urls.length) {
		console.error('No URLs provided');
		process.exit(1);
	}

	await using browser = await launchBrowser();
	const result: Record<string, string> = {};
	for (const url of urls) {
		console.log(`Scraping ${url} ...`);
		await using page = await newPage(browser);
		await page.goto(url, { timeout: 10000 });
		// Check for a captcha that contains the text "confirm you are human"
		const captcha = await page
			.getByText('confirm you are human')
			.first();
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
