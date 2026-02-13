import { lambdaFn } from '@/utils/api';
import { launchBrowser } from '@/utils/browser';
import { extractText } from './utils';
import * as Z from 'zod';

export const api = lambdaFn(
	Z.object({
		url: Z.url()
	}),
	async ({ url }) => {
		await using browser = await launchBrowser();
		return await extractText(browser, url);
	}
);
export const handler = api.handler;
