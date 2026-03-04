import { Page } from 'playwright-core';
import { launchBrowser, newPage, parseCookiesFile } from '../src/utils/browser';
import meow from 'meow';
import { deferral } from '@danoaky/js-utils/disposables';
import { $ } from 'bun';
import { existsSync } from 'fs';

const AUTH_FILE = '/tmp/auth.json';

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

if (import.meta.main) {
	const {
		flags: { headless, authfile, help },
		showHelp
	} = meow(
		`
    Usage
    $ scrape-seek

    Options
    --help, -h        Show help
    --headless    Whether to run the browser in headless mode
    --authfile, -a     Path to a auth file to load
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
	await using page = await newPage(context);
	// await loadCookies(page, cookies);
	await page.goto(
		'https://www.seek.com.au/typescript-jobs/remote?salaryrange=160000-&salarytype=annual&savedsearchid=8d095f4c-5b8d-42ef-a911-eb36c59ba6f8&sitekey=AU-Main&worktype=242%2C244',
		{ waitUntil: 'networkidle', timeout: 10000 }
  );
	const content = await page.content();
  await page.waitForTimeout(10000);
	console.log(content);
}
