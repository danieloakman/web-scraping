/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
	app(input) {
		return {
			name: 'web-scraping',
			removal: input?.stage === 'production' ? 'retain' : 'remove',
			protect: ['production'].includes(input?.stage),
			home: 'aws'
		};
	},
	async run() {
		/** Chromium v149 */
		const CHROMIUM_LAYER = 'arn:aws:lambda:ap-southeast-2:345864471525:layer:chromium:4';
		const DEFAULT_FUNCTION_OPTIONS: Omit<sst.aws.FunctionArgs, 'handler'> = {
			url: true,
			memory: '2 GB',
			timeout: '30 seconds',
			layers: [CHROMIUM_LAYER],
			runtime: 'nodejs22.x',
			environment: {
				PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
				PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: 'true',
				PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? ''
			},
			nodejs: {
				install: ['playwright-core'],
				esbuild: {
					external: ['@sparticuz/chromium']
				}
			}
		};

		const instagramLocationCache = new sst.aws.Dynamo('InstagramLocationCache', {
			fields: {
				query: 'string'
			},
			primaryIndex: { hashKey: 'query' },
			ttl: 'expiresAt'
		});

		const instagramLocations = new sst.aws.Function('instagram-locations', {
			handler: 'src/functions/instagram-locations/index.handler',
			...DEFAULT_FUNCTION_OPTIONS,
			timeout: '2 minutes',
			link: [instagramLocationCache],
			environment: {
				...DEFAULT_FUNCTION_OPTIONS.environment,
				/** Optional Instagram `sessionid` cookie for faster typeahead search. */
				INSTAGRAM_SESSION_ID: process.env.INSTAGRAM_SESSION_ID ?? ''
			},
			nodejs: {
				...DEFAULT_FUNCTION_OPTIONS.nodejs,
				install: [
					...(DEFAULT_FUNCTION_OPTIONS.nodejs?.install ?? []),
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/lib-dynamodb'
				]
			}
		});

		const webpage = new sst.aws.Function('webpage', {
			handler: 'src/functions/webpage/index.handler',
			...DEFAULT_FUNCTION_OPTIONS
		});

		return {
			webpageUrl: webpage.url,
			instagramLocationsUrl: instagramLocations.url
		};
	}
});
