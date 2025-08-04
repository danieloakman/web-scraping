import { lambdaFn } from '@/utils/api';
import { launchBrowser, newPage } from '@/utils/browser';
import * as Z from 'zod';

export const api = lambdaFn(
	Z.object({
		url: Z.url()
	}),
	async ({ url }) => {
		await using browser = await launchBrowser();
		await using page = await newPage(browser);
		await page.goto(url, { timeout: 10000 });
		const content = await page.evaluate(
			() => {
				const text = (document.querySelector('main') ?? document.querySelector('body'))?.innerText;
				if (!text) throw new Error('Could not find main element to get text content from');
				return text;
			},
			{
				timeout: 10000
			}
		);
		return content;
	}
);
export const handler = api.handler;
