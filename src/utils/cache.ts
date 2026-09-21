import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** Default cache TTL: 7 days. */
export const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

function tableName(): string | undefined {
	try {
		return Resource.InstagramLocationCache.name;
	} catch {
		return process.env.INSTAGRAM_LOCATION_CACHE_TABLE;
	}
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
	const TableName = tableName();
	if (!TableName) return undefined;

	const result = await client.send(
		new GetCommand({
			TableName,
			Key: { query: key }
		})
	);
	const item = result.Item;
	if (!item) return undefined;
	if (typeof item.expiresAt === 'number' && item.expiresAt * 1000 < Date.now()) {
		return undefined;
	}
	return item.results as T;
}

export async function cacheSet<T>(
	key: string,
	results: T,
	ttlSeconds = DEFAULT_CACHE_TTL_SECONDS
): Promise<void> {
	const TableName = tableName();
	if (!TableName) return;

	await client.send(
		new PutCommand({
			TableName,
			Item: {
				query: key,
				results,
				expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
				cachedAt: new Date().toISOString()
			}
		})
	);
}
