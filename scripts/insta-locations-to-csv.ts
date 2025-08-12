#! bun
import { Database } from 'bun:sqlite';
import meow from 'meow';
import Path from 'node:path';
import { deferral } from '@danoaky/js-utils/disposables';
import * as Z from 'zod';
import { marshall } from '@aws-sdk/util-dynamodb';

const nthUrlPart = (str: string, n: number) => str.split('/')[n];
const escapedQuoteRe = /"/g;

const locationSchema = Z.object({
	url: Z.string().transform((str) => nthUrlPart(str, 0)),
	name: Z.string().transform((str) => {
		let result = str
			.replace(/[A-Z][^ ]/g, (m) => ' ' + m)
			.trim()
			.replace(/ {2,}/g, ' ')
			.replace(/\t|\\t/g, '');
		const numOfDoubleQuotes = result.match(escapedQuoteRe)?.length ?? 0;
		if (numOfDoubleQuotes % 2 === 1) {
			return result.replaceAll('"', `'`); // Swap these odd quotes to single apostrophes
		}
		return result.replaceAll('"', `"""`); // DynamoDB needs " to be escaped with """
	}),
	parent_url: Z.string()
		.nullish()
		.transform((str) => (str ? nthUrlPart(str, 0) : undefined))
});

export async function exportAsDynamoDBJson(db: Database, outputDir: string, delimiter = '\t') {
	await using defer = deferral();
	const filePath = Path.join(outputDir, `locations.csv`);
	const file = Bun.file(filePath);
	if (await file.exists()) await file.delete();
	const writer = file.writer();
	writer.write(`url${delimiter}name${delimiter}parent_url\n`);
	defer(async () => {
		await writer.end();
	});

	console.log(`Writing table "locations" to ${filePath}`);
	let i = 0;
	const logRow = () => console.log(`Wrote ${i} rows`);
	for await (const row of db.query(`SELECT * FROM locations`)) {
		const { data, error } = locationSchema.safeParse(row);
		if (error) throw error;
		writer.write([data.url, data.name, data.parent_url].join(delimiter) + '\n');
		await writer.flush();
		i++;
		if (i % 10000 === 0) logRow();
	}
	console.log(`Finished writing ${i} rows`);
}

if (import.meta.main) {
	const {
		input: [dbPath, outputDir = process.cwd()]
	} = meow({
		importMeta: import.meta,
		help: `
    Usage
    $ bun run scripts/sqlite-to-dynamodbjson.ts <sqlite-schema.sqlite> <output-directory>`
	});

	await using defer = deferral();
	const db = new Database(dbPath);
	defer(() => db.close());

	await exportAsDynamoDBJson(db, outputDir);
}
