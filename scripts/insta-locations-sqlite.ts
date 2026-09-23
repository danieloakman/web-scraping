#! bun
import { Database } from 'bun:sqlite';
import Path from 'node:path';
import meow from 'meow';
import {
	getAllLocations,
	getLocations,
	isGraphLocationCandidate,
	Location
} from '../src/functions/instagram-locations';
import { launchBrowser } from '../src/utils/browser';
import { deferral } from '@danoaky/js-utils/disposables';

class LocationRow {
	constructor(
		public readonly id: number | bigint | string,
		public readonly name: string,
		public readonly parent_id: string | null
	) {}
}

function countryFromLocation(location: Location): string | null {
	const parentId = location.parent?.id;
	if (parentId && parentId.length === 2) return parentId.toUpperCase();
	return null;
}

/** Instagram city link text is often PascalCase ("GranvilleJunction") — space it like location names. */
export function formatParentDisplayName(name: string): string {
	return name
		.split(',')
		.map((part) =>
			part
				.trim()
				.replace(/([a-z])([A-Z])/g, '$1 $2')
				.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
				.replace(/\s+/g, ' ')
				.trim()
		)
		.filter(Boolean)
		.join(', ');
}

function humanizeParentSlug(slug: string): string {
	return formatParentDisplayName(
		slug
			.replace(/-australia$/i, '')
			.split('-')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
			.join(' ')
	);
}

function ensureSchema(db: Database) {
	db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS parents (
      id      TEXT PRIMARY KEY,
      name    TEXT NOT NULL,
      country TEXT
    );
    CREATE TABLE IF NOT EXISTS locations (
      id        INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      parent_id TEXT REFERENCES parents(id)
    );
    CREATE INDEX IF NOT EXISTS locations_parent_id ON locations(parent_id);
  `);

	const parentCols = db.query(`PRAGMA table_info(parents)`).all() as Array<{ name: string }>;
	if (!parentCols.some((col) => col.name === 'country')) {
		db.exec(`ALTER TABLE parents ADD COLUMN country TEXT`);
	}
}

/** Upsert parent with a display name, overwriting slug stubs. */
function prepareParentWriters(db: Database) {
	const upsertDisplayName = db.prepare(`
		INSERT INTO parents (id, name, country) VALUES (?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			country = COALESCE(excluded.country, parents.country)
	`);
	/** Only used when a place arrives before its city row — keep slug until display name lands. */
	const insertSlugStub = db.prepare(`
		INSERT INTO parents (id, name, country) VALUES (?, ?, ?)
		ON CONFLICT(id) DO NOTHING
	`);
	return { upsertDisplayName, insertSlugStub };
}

async function fixParentNames(
	db: Database,
	{ headless, defaultCountry }: { headless: boolean; defaultCountry: string }
) {
	const { upsertDisplayName } = prepareParentWriters(db);
	await using browser = await launchBrowser({ headless });
	const cities = [...(await getLocations(browser, 'AU/australia'))].filter(
		(loc) => loc.type === 'region'
	);
	const update = db.transaction((regions: Location[]) => {
		for (const region of regions) {
			upsertDisplayName.run(
				region.id,
				formatParentDisplayName(region.name),
				countryFromLocation(region) ?? defaultCountry
			);
		}
	});
	update(cities);

	/** Cities that never appeared on the AU directory still have slug stubs. */
	const stubs = db
		.prepare(`SELECT id, name FROM parents WHERE name LIKE '%-australia'`)
		.all() as Array<{ id: string; name: string }>;
	for (const stub of stubs) {
		upsertDisplayName.run(stub.id, humanizeParentSlug(stub.name), defaultCountry);
	}

	/** Re-space any PascalCase names left from older scrapes. */
	const allParents = db.prepare(`SELECT id, name FROM parents`).all() as Array<{
		id: string;
		name: string;
	}>;
	let respaced = 0;
	for (const parent of allParents) {
		const formatted = formatParentDisplayName(parent.name);
		if (formatted !== parent.name) {
			upsertDisplayName.run(parent.id, formatted, defaultCountry);
			respaced++;
		}
	}

	db.prepare(
		`UPDATE parents SET country = ? WHERE country IS NULL OR country = ''`
	).run(defaultCountry);

	console.log(
		`Updated ${cities.length} parent display names from AU directory` +
			(stubs.length ? ` (+${stubs.length} slug stubs humanized)` : '') +
			(respaced ? ` (+${respaced} PascalCase respace)` : '') +
			`; country=${defaultCountry}`
	);
}

if (import.meta.main) {
	const {
		flags: { output, headless, parallelBrowsers, fixParentNames: fixParentsOnly }
	} = meow(
		`
    Usage
      $ bun run scripts/insta-locations-sqlite.ts
      $ bun run scripts/insta-locations-sqlite.ts --fix-parent-names

    Writes only Graph-candidate locations (digit id length ≥ 12).
    Parents (GeoNames cities) store Instagram display names + ISO country;
    locations store integer Graph ids + optional parent_id FK.
    Currently seeds from AU only.

    Options
      --output, -o  Output file (default: ./locations.sqlite)
      --headless, -H  Run in headless mode (default: false)
      --parallel-browsers, -p  Number of parallel browsers to use (default: 1)
      --fix-parent-names  Re-fetch AU city display names into parents (no full crawl)
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
				},
				fixParentNames: {
					type: 'boolean',
					default: false
				}
			}
		}
	);

	const seedCountries = ['AU'] as const;
	const defaultCountry = seedCountries[0];

	await using defer = deferral();
	const db = new Database(output);
	defer(() => db.close());
	ensureSchema(db);

	if (fixParentsOnly) {
		await fixParentNames(db, { headless, defaultCountry });
		process.exit(0);
	}

	const { upsertDisplayName, insertSlugStub } = prepareParentWriters(db);
	const insertStmt = db.prepare(
		'INSERT INTO locations (id, name, parent_id) VALUES (?, ?, ?)'
	);
	const existsStmt = db.prepare('SELECT * FROM locations WHERE id = ?').as(LocationRow);
	defer(() => {
		upsertDisplayName.finalize();
		insertSlugStub.finalize();
		insertStmt.finalize();
		existsStmt.finalize();
	});

	const insertMany = db.transaction((locations: Location[]) => {
		for (const location of locations) {
			if (location.type === 'region') {
				upsertDisplayName.run(
					location.id,
					formatParentDisplayName(location.name),
					countryFromLocation(location) ?? defaultCountry
				);
			}

			if (!isGraphLocationCandidate(location.id)) continue;

			// Bind as digit string so SQLite stores a full INTEGER64 without JS Number precision loss.
			const exists = existsStmt.get(location.id);
			if (exists) continue;

			let parentId: string | null = null;
			if (location.parentUrl) {
				parentId = location.parentUrl[0];
				const slug = location.parentUrl[1] || parentId;
				insertSlugStub.run(parentId, humanizeParentSlug(slug), defaultCountry);
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
			regionSearchCountries: [...seedCountries]
		}
	);
}
