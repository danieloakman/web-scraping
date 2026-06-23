import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readOutputsWebpageUrl(): string | undefined {
	const outputsPath = join(process.cwd(), '.sst/outputs.json');
	if (!existsSync(outputsPath)) return undefined;

	try {
		const outputs = JSON.parse(readFileSync(outputsPath, 'utf-8')) as {
			webpageUrl?: string;
		};
		return typeof outputs.webpageUrl === 'string' && outputs.webpageUrl.length
			? outputs.webpageUrl
			: undefined;
	} catch {
		return undefined;
	}
}

function readResourceWebpageUrl(): string | undefined {
	const raw = process.env.SST_RESOURCE_webpage;
	if (!raw) return undefined;

	try {
		const resource = JSON.parse(raw) as { url?: string };
		return typeof resource.url === 'string' && resource.url.length ? resource.url : undefined;
	} catch {
		return undefined;
	}
}

/** Resolves the deployed SST webpage function URL when `sst dev` or `sst deploy` is active. */
export function getWebpageEndpointUrl(): string | undefined {
	return (
		process.env.WEBPAGE_URL ?? readResourceWebpageUrl() ?? readOutputsWebpageUrl()
	);
}

export async function callWebpageEndpoint(url: string): Promise<string> {
	const endpointUrl = getWebpageEndpointUrl();
	if (!endpointUrl) {
		throw new Error(
			'Webpage endpoint URL is not available. Start `sst dev` or set WEBPAGE_URL.'
		);
	}

	const res = await fetch(endpointUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url })
	});
	const body = await res.text();
	if (!res.ok) throw new Error(`Endpoint returned ${res.status}: ${body}`);

	return JSON.parse(body) as string;
}
