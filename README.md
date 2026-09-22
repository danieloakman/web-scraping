# Web Scraping

Collection of web-scraping lambda functions, utilities and scripts.

## Commands

| Script | What it does |
| --- | --- |
| `bun run dev` | Local SST live-dev |
| `bun run deploy` | Deploy to AWS (`--stage prod`) |
| `bun run refresh` | Refresh SST state against AWS (`--stage prod`) |
| `bun run remove` | Tear down the prod stage |
| `bun run build` | Build without deploying (`--stage prod`) |
| `bun run check` | Typecheck with `tsc` |
| `bun run test` | Run unit tests |
| `bun run test:dev` | Run tests under `sst dev` |
| `bun run lint` / `bun run format` | Check / fix Prettier (+ eslint) |
| `bun run upgrade-interactive` | Interactively bump dependencies |

After upgrading SST major versions, run `bun run refresh` before `bun run deploy` so state migrates cleanly.

## Calling functions

Functions are exposed as HTTPS URLs (`url: true` in SST). After `bun run deploy` or `bun run dev`, URLs are in `.sst/outputs.json` (or set `WEBPAGE_URL` / `INSTAGRAM_LOCATIONS_URL`).

### `webpage`

Scrapes a page and returns its main/body text as a JSON string.

**Request:** `POST` with `{ "url": "<https url>" }`

```bash
curl -sS -X POST "$WEBPAGE_URL" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

```ts
const res = await fetch(process.env.WEBPAGE_URL!, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com' })
});
const text: string = await res.json();
```

Or use the helper in this repo:

```ts
import { callWebpageEndpoint } from '@/utils/sst-endpoint';

const text = await callWebpageEndpoint('https://example.com');
```

### `instagram-locations`

Searches Instagram explore locations and returns **Graph `location_id` candidates** only (digit ids with length ≥ 12). Short explore `pk`s and GeoNames `c…` ids are hard-filtered out. Length is a heuristic, not a Graph publish guarantee. Responses are cached in DynamoDB (7-day TTL).

**Request:** `POST` with `{ "query": "Sydney NSW" }`

Include a **country/region hint** (`NSW`, `QLD`, `Australia`, …) — required for directory scrape.

```bash
curl -sS -X POST "$INSTAGRAM_LOCATIONS_URL" \
  -H 'Content-Type: application/json' \
  -d '{"query":"Sydney NSW"}'
```

```ts
const res = await fetch(process.env.INSTAGRAM_LOCATIONS_URL!, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'Sydney NSW' })
});
const locations: Array<{
  graphLocationId: string;
  name: string;
  parentName?: string;
  fullUrl?: string;
}> = await res.json();
```

Or use the script:

```bash
bun run scripts/insta-locations-search.ts "Sydney NSW"
bun run scripts/insta-locations-search.ts "Melbourne VIC" -o melbourne.json -n 5
```

See [docs/instagram-location-ids-graph-publish.md](docs/instagram-location-ids-graph-publish.md) for Graph publish context.
