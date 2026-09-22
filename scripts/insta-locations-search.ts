#! bun
import meow from 'meow';
import {
	callInstagramLocationsEndpoint,
	getInstagramLocationsEndpointUrl
} from '../src/utils/sst-endpoint';

if (import.meta.main) {
	const cli = meow(
		`
    Usage
      $ bun run scripts/insta-locations-search.ts <query>

    Returns Graph location_id candidates only (digit id length ≥ 12).
    Include a country/region hint (e.g. NSW, QLD, Australia).

    Examples
      $ bun run scripts/insta-locations-search.ts "Sydney NSW"
      $ bun run scripts/insta-locations-search.ts "QLD surfers paradise" -o surfers.json -n 5

    Options
      --output, -o  Write full JSON results to a file (also prints a short summary)
      --limit, -n   Only print the first N results to stdout (default: all)
  `,
		{
			importMeta: import.meta,
			flags: {
				output: {
					type: 'string',
					shortFlag: 'o'
				},
				limit: {
					type: 'number',
					shortFlag: 'n'
				}
			}
		}
	);

	const query = cli.input.join(' ').trim();
	if (!query) {
		cli.showHelp(1);
	}

	const endpoint = getInstagramLocationsEndpointUrl();
	if (!endpoint) {
		console.error(
			'Instagram locations endpoint URL is not available. Start `sst dev` / `sst deploy`, or set INSTAGRAM_LOCATIONS_URL.'
		);
		process.exit(1);
	}

	console.error(`POST ${endpoint}`);
	console.error(`query: ${query}`);

	const locations = await callInstagramLocationsEndpoint(query);
	const preview =
		cli.flags.limit != null && cli.flags.limit >= 0
			? locations.slice(0, cli.flags.limit)
			: locations;

	if (cli.flags.output) {
		await Bun.write(cli.flags.output, JSON.stringify(locations, null, 2));
		console.error(`wrote ${locations.length} locations → ${cli.flags.output}`);
	}

	console.log(JSON.stringify(preview, null, 2));
	console.error(`count: ${locations.length}`);
}
