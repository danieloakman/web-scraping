# Instagram location search → Graph `location_id`

Handoff for the `instagram-locations` API (`src/functions/instagram-locations/`, `scripts/insta-locations-search.ts`).

Consumer: [grid-preview](https://github.com/danieloakman/grid-preview) issue [#60](https://github.com/danieloakman/grid-preview/issues/60) — location tagging on posts published via **Instagram Graph** (`POST …/media` with `location_id`).

Family / internal builds only for now. Store builds will hide location search. Do **not** treat this as an App Store–safe product path.

---

## What Graph publish actually needs

Instagram Graph `location_id` must be a **Facebook Page ID that has lat/long**.

It is **not**:

- GeoNames-style ids (`c114891`)
- Short Instagram explore / typeahead **`pk`s** (often ≤9 digits, sometimes longer)

Evidence from grid-preview:

| ID | Source | Publish |
|---|---|---|
| `214264274` | Scraped / explore-style | Rejected: `Param location_id is not a valid location page ID` |
| `106281374730692` | Manual / Facebook Page | Accepted |

Official path Meta wants long-term: Pages Search + **Page Public Metadata Access** (App Review + Business Verification). This scraping API is a family-only stopgap that returns **Page-shaped digit id candidates** (length ≥ 12). That is a heuristic, not a Graph guarantee.

---

## What this API returns now

Hard-filtered directory scrape (no Instagram session). Response shape:

```json
{
  "graphLocationId": "102771511673021",
  "name": "Meriton Suites",
  "parentName": "Surfers Paradise",
  "fullUrl": "https://www.instagram.com/explore/locations/102771511673021/meriton-suites"
}
```

Rules:

- Only digit ids with **length ≥ 12** (`isGraphLocationCandidate`)
- Drops GeoNames `c…` and short explore `pk`s
- Country/region hint required in the query (`NSW`, `QLD`, `Australia`, …)
- Dynamo cache keys prefixed `v2:` so old explore-pk payloads are ignored
- SQLite dump (`scripts/insta-locations-sqlite.ts`) uses the same insert filter

Length alone is **not** proof the id will publish. Live Graph smoke tests are still outstanding.

---

## Analysis of `surfers_paradise.json` (pre-filter dump)

Query dump: ~1001 locations for Surfers Paradise area (before hard-filter).

| Id shape | Count | Likely Graph-usable? |
|---|---|---|
| GeoNames `c…` / non-digit | 1 | No |
| Digit length &lt; 10 | 548 | No (classic `pk`) |
| Digit length ≥ 10 | 452 | Maybe |
| Digit length 12–16 (Page-shaped) | 387 | Best candidates (what the API returns now) |

### Useful vs not in that dump

- **Top-ranked “Surfers Paradise” hits** were short `pk`s (`214737000`, …) — now excluded.
- **Page-shaped ids** remain, mostly venues, e.g.:
  - Meriton Suites — `102771511673021`
  - Novotel Surfers Paradise — `633970983450538`
  - Gold Coast, Australia — `107966999898359`
- The **known-good** publish id from #60 (`106281374730692`) was **not** in that file.

---

## Suggested validation checklist

- [x] Hard-filter publishable list to digit length ≥ 12; drop `c…` / short `pk`s
- [x] Response uses `graphLocationId` only for filtered ids (never short `pk`)
- [x] No Instagram session dependency for the happy path
- [x] SQLite dump stores Graph-candidate ids only
- [ ] Smoke-test 3–5 long ids (venue + city) via Graph `location_id`; note which succeed
- [ ] Compare against known-good `106281374730692` — can search find it or an equivalent that publishes?
- [ ] (Optional later) Inspect authenticated `topsearch` for `facebook_places_id` / lat-long if session becomes available

---

## References

- Meta: [IG User Media `location_id`](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/)
- Meta: [Pages Search](https://developers.facebook.com/docs/pages-api/search-pages/) (official long-term source)
- Meta: [Page Public Metadata Access](https://developers.facebook.com/docs/features-reference/page-public-metadata-access/)
- grid-preview #60: replace on-device `locations.db` with publish-valid location ids
- Local CLI: `bun run scripts/insta-locations-search.ts "QLD surfers paradise" -n 5`
