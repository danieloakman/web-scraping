#! bun
import { Database } from 'bun:sqlite';
import Path from 'node:path';
import meow from 'meow';
import { getAllLocations, Location } from '../src/functions/instagram-locations';
import { deferral } from '@danoaky/js-utils/disposables';

class LocationRow {
	constructor(
		public readonly url: string,
		public readonly name: string,
		public readonly parent_url: string | null
	) {}

	static from(location: Location) {
		return new LocationRow(
			location.url.join('/'),
			location.name,
			location.parentUrl?.join('/') ?? null
		);
	}
}

if (import.meta.main) {
	const {
		flags: { output, headless, parallelBrowsers }
	} = meow(
		`
    Usage
    $ bun run scripts/instagram-location-scrape.ts

    Options
    --output, -o  Output file (default: ./locations.sqlite)
    --headless, -h  Run in headless mode (default: false)
    --parallel-browsers, -p  Number of parallel browsers to use (default: 1)
  `,
		{
			importMeta: import.meta,
			flags: {
				output: {
					type: 'string',
					shortFlag: 'o',
					default: Path.join(process.cwd(), 'locations.sqlite')
				},
				headless: {
					type: 'boolean',
					shortFlag: 'h',
					default: false
				},
				parallelBrowsers: {
					type: 'number',
					shortFlag: 'p',
					default: 1
				}
			}
		}
	);

	await using defer = deferral();
	const db = new Database(output);
	defer(() => db.close());
	db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS locations (
      url TEXT PRIMARY KEY UNIQUE,
      name TEXT,
      parent_url TEXT NULL
    )
  `);
	const insertStmt = db.prepare('INSERT INTO locations (url, name, parent_url) VALUES (?, ?, ?)');
	const existsStmt = db.prepare('SELECT * FROM locations WHERE url = ?').as(LocationRow);
	defer(() => {
		insertStmt.finalize();
		existsStmt.finalize();
	});
	const insertMany = db.transaction((locations: Location[]) => {
		for (const location of locations) {
			const asRow = LocationRow.from(location);
			const exists = existsStmt.get(asRow.url);
			if (exists) {
				if (exists.url !== asRow.url)
					throw new Error(
						`Location ${location.id} already exists with different url: ${exists.url} -> ${asRow.url}`
					);
				continue;
			}
			insertStmt.run(asRow.url, asRow.name, asRow.parent_url);
		}
	});
	// const searchStmt = db.prepare('SELECT url FROM locations WHERE url LIKE ?');

	await getAllLocations(
		async (locations) => {
			await insertMany(locations);
		},
		{
			headless,
			parallelBrowsers,
			regionSearchCountries: ['AU']
		}
	);
}
