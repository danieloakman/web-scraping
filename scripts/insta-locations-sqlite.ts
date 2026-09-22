#! bun
import { Database } from 'bun:sqlite';
import Path from 'node:path';
import meow from 'meow';
import {
	getAllLocations,
	isGraphLocationCandidate,
	Location
} from '../src/functions/instagram-locations';
import { deferral } from '@danoaky/js-utils/disposables';

class LocationRow {
	constructor(
		public readonly id: number | bigint | string,
		public readonly name: string,
		public readonly parent_id: string | null
	) {}
}

if (import.meta.main) {
	const {
		flags: { output, headless, parallelBrowsers }
	} = meow(
		`
    Usage
      $ bun run scripts/insta-locations-sqlite.ts

    Writes only Graph-candidate locations (digit id length ≥ 12).
    Parents (GeoNames cities) live in a separate table; locations store
    integer Graph ids + optional parent_id FK. Currently seeds from AU only.

    Options
      --output, -o  Output file (default: ./locations.sqlite)
      --headless, -H  Run in headless mode (default: false)
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
					shortFlag: 'H',
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
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS parents (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS locations (
      id        INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      parent_id TEXT REFERENCES parents(id)
    );
    CREATE INDEX IF NOT EXISTS locations_parent_id ON locations(parent_id);
  `);
	const upsertParentStmt = db.prepare(
		'INSERT INTO parents (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING'
	);
	const insertStmt = db.prepare(
		'INSERT INTO locations (id, name, parent_id) VALUES (?, ?, ?)'
	);
	const existsStmt = db.prepare('SELECT * FROM locations WHERE id = ?').as(LocationRow);
	defer(() => {
		upsertParentStmt.finalize();
		insertStmt.finalize();
		existsStmt.finalize();
	});

	const insertMany = db.transaction((locations: Location[]) => {
		for (const location of locations) {
			if (!isGraphLocationCandidate(location.id)) continue;

			// Bind as digit string so SQLite stores a full INTEGER64 without JS Number precision loss.
			const exists = existsStmt.get(location.id);
			if (exists) continue;

			let parentId: string | null = null;
			if (location.parentUrl) {
				parentId = location.parentUrl[0];
				const parentName = location.parentUrl[1] || parentId;
				upsertParentStmt.run(parentId, parentName);
			}

			insertStmt.run(location.id, location.name, parentId);
		}
	});

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
