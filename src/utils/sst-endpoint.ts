import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LocationResult } from '@/functions/instagram-locations';

type Outputs = {
	webpageUrl?: string;
	instagramLocationsUrl?: string;
};

function readOutputs(): Outputs | undefined {
	const outputsPath = join(process.cwd(), '.sst/outputs.json');
	if (!existsSync(outputsPath)) return undefined;

	try {
		return JSON.parse(readFileSync(outputsPath, 'utf-8')) as Outputs;
	} catch {
		return undefined;
	}
}

function readResourceUrl(envKey: string): string | undefined {
	const raw = process.env[envKey];
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
		process.env.WEBPAGE_URL ??
		readResourceUrl('SST_RESOURCE_webpage') ??
		readOutputs()?.webpageUrl
	);
}

export function getInstagramLocationsEndpointUrl(): string | undefined {
	return (
		process.env.INSTAGRAM_LOCATIONS_URL ??
		readResourceUrl('SST_RESOURCE_instagram-locations') ??
		readOutputs()?.instagramLocationsUrl
	);
}

export async function callWebpageEndpoint(url: string): Promise<string> {
	const endpointUrl = getWebpageEndpointUrl();
	if (!endpointUrl) {
		throw new Error('Webpage endpoint URL is not available. Start `sst dev` or set WEBPAGE_URL.');
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

export async function callInstagramLocationsEndpoint(query: string): Promise<LocationResult[]> {
	const endpointUrl = getInstagramLocationsEndpointUrl();
	if (!endpointUrl) {
		throw new Error(
			'Instagram locations endpoint URL is not available. Start `sst dev` or set INSTAGRAM_LOCATIONS_URL.'
		);
	}

	const res = await fetch(endpointUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query })
	});
	const body = await res.text();
	if (!res.ok) throw new Error(`Endpoint returned ${res.status}: ${body}`);

	return JSON.parse(body) as LocationResult[];
}
