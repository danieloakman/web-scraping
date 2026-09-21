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

Official path Meta wants long-term: Pages Search + **Page Public Metadata Access** (App Review + Business Verification). This scraping API is a family-only stopgap **only if** it can return Graph-valid Page ids.

---

## What this API returns today

Results look like:

```json
{
  "id": "214737000",
  "place": "surfers-paradise-queensland",
  "name": "Surfers Paradise, Queensland",
  "type": "place",
  "fullUrl": "https://www.instagram.com/explore/locations/214737000/…",
  "parentUrl": "c114891/surfersparadise-australia"
}
```

Implementation notes:

- Directory scrape + optional authenticated `topsearch` (`searchLocationsTopsearch`)
- Typeahead maps **`place.location.pk` only** — no `external_id`, Facebook Page id, or lat/long
- Ids are Instagram **explore location** ids, mixed eras/systems

That is the same wrong source class as the old on-device `locations.db` dump. Wiring it into grid-preview as-is would recreate #60.

---

## Analysis of `surfers_paradise.json`

Query dump: ~1001 locations for Surfers Paradise area.

| Id shape | Count | Likely Graph-usable? |
|---|---|---|
| GeoNames `c…` / non-digit | 1 | No |
| Digit length &lt; 10 | 548 | No (classic `pk`) |
| Digit length ≥ 10 | 452 | Maybe |
| Digit length 12–16 (Page-shaped) | 387 | Best candidates |

Length histogram (digit ids): heavy at **9** (~426), then **15** (~309) and **16** (~75).

### Useful vs not in that dump

- **Top-ranked “Surfers Paradise” hits** are still short `pk`s (`214737000`, `219037025`, `933522`, …) — unusable for Graph.
- **Page-shaped ids exist**, mostly venues, e.g.:
  - Meriton Suites — `102771511673021`
  - Novotel Surfers Paradise — `633970983450538`
  - Gold Coast, Australia — `107966999898359`
- The **known-good** publish id from #60 (`106281374730692`, “Surfers Paradise ← Gold Coast”) is **not** in this file.
- There is **no field** that marks “this id is a Facebook Page with lat/long”. Length ≥ 10/12 is only a heuristic.

**Verdict:** the dump *contains some ids that might work*, but the API does not identify them, and search ranking prefers bad `pk`s. Not shippable as a Graph location source without filtering + validation (or a better id field).

---

## What would make this API useful for grid-preview

Goal: return candidates safe to pass as Graph `location_id`.

### Must-have

1. **Surface a Graph-valid id**, not only explore `pk`.
   - Prefer Facebook Page / Places id if the private/web payload has something like `external_id`, `facebook_places_id`, or equivalent.
   - If only `pk` exists, document that and do not claim Graph compatibility.
2. **Filter or label** results:
   - Drop `c…` / non-digit ids from “publishable” results.
   - Prefer digit length ≥ 12 (or ≥ 10) only as a weak interim filter — not a guarantee.
3. **Optional but valuable:** include `latitude` / `longitude` when available; Graph requires the Page to have location.
4. **Smoke-test contract:** for a few returned ids, confirm Graph create-media accepts `location_id` (manual or scripted against a test IG account). Record pass/fail examples in this doc or tests.

### Nice-to-have for the mobile client

- Stable display name + parent/region label (grid-preview currently reverse-looks up parents from SQLite).
- Debounce-friendly, cached responses (already DynamoDB TTL).
- Clear response shape, e.g.:

```ts
{
  id: string;              // explore pk (optional, for links)
  graphLocationId?: string; // ONLY set when believed Graph-safe
  name: string;
  latitude?: number;
  longitude?: number;
  parentName?: string;
}
```

Never put a short `pk` in `graphLocationId`.

### Out of scope / do not

- Ship this path in App Store / Play builds (Instagram ToS / session risk).
- Assume length alone == valid Page id without a publish smoke test.
- Use private APIs as the long-term production solution (that remains Meta Pages Search + PPMA).

---

## Suggested validation checklist

- [ ] Inspect raw `topsearch` / location payloads for any non-`pk` id fields.
- [ ] If found: map that field to `graphLocationId`; keep `pk` separate.
- [ ] If not found: say so explicitly; API cannot satisfy Graph tagging.
- [ ] Filter sample query `"QLD surfers paradise"` / `"Surfers Paradise"` so publishable list excludes ≤9-digit ids.
- [ ] Smoke-test 3–5 long ids (venue + city) via Graph `location_id`; note which succeed.
- [ ] Compare against known-good `106281374730692` — can search find it or an equivalent that publishes?

---

## References

- Meta: [IG User Media `location_id`](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/)
- Meta: [Pages Search](https://developers.facebook.com/docs/pages-api/search-pages/) (official long-term source)
- Meta: [Page Public Metadata Access](https://developers.facebook.com/docs/features-reference/page-public-metadata-access/)
- grid-preview #60: replace on-device `locations.db` with publish-valid location ids
- Local dump: `surfers_paradise.json` (repo root)
- Local CLI: `bun run scripts/insta-locations-search.ts "QLD surfers paradise" -n 5`
