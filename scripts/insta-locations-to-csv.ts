#! bun
import { Database } from 'bun:sqlite';
import meow from 'meow';
import Path from 'node:path';
import { deferral } from '@danoaky/js-utils/disposables';
import * as Z from 'zod';
import { marshall } from '@aws-sdk/util-dynamodb';
import { isObjectLike } from '@danoaky/js-utils';

interface Writer {
	write(line: unknown): Promise<void>;
	[Symbol.asyncDispose](): Promise<void>;
}

// This writer actually finally ended up working to import into DynamoDB.
export class DynamoDBJsonWriter implements Writer {
	protected constructor(
		private readonly writer: Bun.FileSink,
		private readonly schema: Z.ZodSchema
	) {}

	static async create(path: string, schema: Z.ZodSchema) {
		const file = Bun.file(path);
		if (await file.exists()) await file.delete();
		const writer = file.writer();
		return new DynamoDBJsonWriter(writer, schema);
	}

	async write(line: unknown) {
		const data = marshall(this.schema.parse(line), { removeUndefinedValues: true });
		this.writer.write(JSON.stringify({ Item: data }) + '\n');
		await this.writer.flush();
	}

	async [Symbol.asyncDispose]() {
		await this.writer.end();
	}
}

export class CSVWriter implements Writer {
	protected constructor(
		private readonly writer: Bun.FileSink,
		private readonly schema: Z.ZodSchema,
		private readonly headers: string[],
		private readonly delimiter = '\t'
	) {}

	static async create(path: string, schema: Z.ZodSchema, headers: string[], delimiter = '\t') {
		const file = Bun.file(path);
		if (await file.exists()) await file.delete();
		const writer = file.writer();
		writer.write(headers.join(delimiter) + '\n');
		return new CSVWriter(writer, schema, headers, delimiter);
	}

	async write(line: unknown) {
		const data = this.schema.parse(line);
		if (!isObjectLike(data)) throw new Error('Expected object');
		this.writer.write(this.headers.map((header) => data[header]).join(this.delimiter) + '\n');
		await this.writer.flush();
	}

	async [Symbol.asyncDispose]() {
		await this.writer.end();
	}
}

const nthUrlPart = (str: string, n: number) => str.split('/')[n];
const escapedQuoteRe = /"/g;
const nonAllowedCharsRe = /[^a-zA-Z0-9 '";:()&#@|/\-_+*,.?!]/g;

const locationSchema = Z.object({
	url: Z.string().transform((str) => nthUrlPart(str, 0)),
	name: Z.string().transform((str) => {
		let result = str
			.replace(nonAllowedCharsRe, '')
			.replace(/[a-z][A-Z][a-z]/g, (m) => m[0] + ' ' + m[1] + m[2])
			.trim()
			.replace(/ {2,}/g, ' ')
			.replace(/\t|\\t/g, '')
			.replaceAll('’', `'`);
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

export async function exportLocations(db: Database, writer: Writer) {
	let i = 0;
	const logRow = () => console.log(`Wrote ${i} rows`);
	for await (const row of db.query(`SELECT * FROM locations`)) {
		await writer.write(row);
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

	await using writer = await DynamoDBJsonWriter.create(
		Path.join(outputDir, 'locations.json'),
		locationSchema
	);
	// await using writer = await CSVWriter.create(
	// 	Path.join(outputDir, 'locations.csv'),
	// 	locationSchema,
	// 	['url', 'name', 'parent_url'],
	// 	'\t'
	// );
	await exportLocations(db, writer);
}
