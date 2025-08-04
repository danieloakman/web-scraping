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
		/** Chromium v138 */
		const chromiumLayer = 'arn:aws:lambda:ap-southeast-2:345864471525:layer:chromium:3';
		new sst.aws.Function('instagram-locations', {
			handler: 'src/functions/instagram-locations.handler',
			url: true,
			memory: '2 GB',
			timeout: '30 seconds',
			layers: [chromiumLayer],
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
		});
	}
});
