#! bun
import { Database } from 'bun:sqlite';
import meow from 'meow';
import Path from 'node:path';
import { deferral } from '@danoaky/js-utils/disposables';
import * as Z from 'zod';

const nthUrlPart = (str: string, n: number) => str.split('/')[n];

const locationSchema = Z.object({
	url: Z.string().transform((str) => nthUrlPart(str, 0)),
	name: Z.string().transform((str) =>
		str
			.replace(/[A-Z][^ ]/g, (m) => ' ' + m)
			.trim()
			.replace(/ {2,}/g, ' ')
	),
	parent_url: Z.string()
		.nullish()
		.transform((str) => (str ? nthUrlPart(str, 0) : undefined))
});

export async function exportAsDynamoDBJson(db: Database, outputDir: string) {
	await using defer = deferral();
	const filePath = Path.join(outputDir, `locations.csv`);
	const file = Bun.file(filePath);
	if (await file.exists()) await file.delete();
	const writer = file.writer();
	writer.write('url,name,parent_url\n');
	defer(async () => {
		await writer.end();
	});

	console.log(`Writing table "locations" to ${filePath}`);
	let i = 0;
	const logRow = () => console.log(`Wrote ${i} rows`);
	for await (const row of db.query(`SELECT * FROM locations`)) {
		const { data, error } = locationSchema.safeParse(row);
		if (error) throw error;
		writer.write([data.url, data.name, data.parent_url].join(',') + '\n'); // TODO: add parent_url
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
