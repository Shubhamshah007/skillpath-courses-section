# Skillpath — courses section

A Framer code component that renders a course grid from a live, deliberately unreliable API.

The deliverable is one file: [`src/CoursesSection.tsx`](src/CoursesSection.tsx). Everything
else in this repo exists to develop and document it.

- **API base:** `https://syncsphere-hiv6.onrender.com`
- **Endpoints:** `GET /assignment/course-data`, `GET /assignment/country-code`

---

## Running it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

The preview harness (`preview/`) renders the exact same component file with buttons for the
three breakpoint widths and a remount button to force a refetch.

`CoursesSection.tsx` imports `addPropertyControls` from `"framer"`, which only exists inside
Framer. Rather than keep a separate local copy of the component, `vite.config.ts` aliases
`"framer"` to a small stub in `preview/framer-shim.ts`. **The component file contains no
preview-only code**, so it goes into Framer by copy-paste with nothing to strip out.

---

## What the API actually does

Measured across ~50 calls before writing any code, because the numbers changed some
decisions:

| Observation | Consequence |
| --- | --- |
| ~20–25% of requests fail, **randomly and independently per call** | Failures are transient, so a capped retry is a real fix rather than a cover-up |
| The brief says "404 or 500", but **503 also occurs** — seen in the browser, never in ~50 command-line samples | Why the code retries on any non-`ok` response instead of matching a list of status codes. Enumerating the ones you were told about would have missed this |
| Course count genuinely varies 5–10 per call | The grid can never assume a row count |
| `access-control-allow-origin: *` | Browser `fetch` works from a published Framer domain |
| `POST` **and `HEAD`** both return 405 | Send a plain GET with no headers — which also keeps it a CORS "simple request", so there is no preflight |
| Hosted on a free tier that sleeps when idle (`x-render-origin-server: uvicorn`) | A cold start can take 30+ seconds, so the timeout is 30s rather than a habitual 5s, and the loading state has to look deliberate |
| Errors return `{"detail":"Not Found"}` | Never rendered — the user gets plain language instead |

---

## Decisions worth explaining

### Retry, three attempts

Because the failures are random per request rather than a sustained outage, retrying
actually works: three attempts takes roughly a 25% failure rate down to about 1.6%.

The cap is the important part. Retrying is not the same as hiding the error — after the
last attempt the error is rethrown and the section shows a real error state with a retry
button. Retrying forever, or swallowing the final failure, would be hiding it.

### `Promise.allSettled`, not `Promise.all`

The two endpoints fail independently, so they are settled independently. `Promise.all`
rejects as soon as either call fails, which would blank the entire grid roughly a quarter of
the time because of a call that only decides a currency symbol.

### Five states, not four

| State | What shows |
| --- | --- |
| Loading | Skeleton cards |
| Error | Plain-language message and a retry button |
| Empty | "No courses available right now" |
| Working | The grid |
| **Courses loaded, country lookup failed** | **The full grid, plus a visible notice that prices fell back to rupees** |

The fifth is the interesting one. A missing country code changes how a price is *labelled*,
not whether the catalogue exists — so blanking ten valid courses because an auxiliary call
returned 404 would be the wrong trade. The component picks a fallback currency **and says
so on screen**. Falling back openly is defensible; silently showing ₹ as though it had been
confirmed is not.

There is also a sixth, smaller state: a search that matches nothing says "no courses match",
which is a different message from "no courses available".

### Price formatting

Both price fields are in minor units, so both divide by 100: `199900` paise is **₹1,999**
and `3999` cents is **$39.99**.

`Intl.NumberFormat` handles the symbol and the grouping. Rupees use `maximumFractionDigits:
0` when the amount is a whole number, because `₹1,999.00` reads wrong — but the check is on
the value, so a genuine paise remainder still renders (`99950` → `₹999.50`).

The trap here is sharper than it looks: `en-IN` grouping really is lakh-style, so forgetting
to divide produces a convincing-looking `₹1,99,900`.

### Container queries for the grid

```css
.sp-grid { grid-template-columns: 1fr; }
@container (min-width: 640px) { .sp-grid { grid-template-columns: repeat(2, 1fr); } }
@container (min-width: 960px) { .sp-grid { grid-template-columns: repeat(3, 1fr); } }
```

- Not `repeat(auto-fit, minmax(...))`: auto-fit chooses its own column count and will happily
  produce four columns on a wide screen. The requirement is exactly 3 / 2 / 1.
- Not `@media`: media queries measure the *viewport*. Drop this component into a half-width
  column and a 400px-wide component would still think it was on desktop. Container queries
  measure the component's own width, which is what actually decides whether three cards fit.

Cards use `min-width: 0` so a long word shrinks the card instead of overflowing the column,
and the price is pushed down with `margin-top: auto` so cards of different text lengths still
line up — which matters because the varying course count leaves ragged final rows.

### The fourth card field: `mainCategory`

`courseCode` and `mangoId` are internal identifiers, and `shortCourse` is just a truncation
of the name already on the card. `mainCategory` is how a learner actually scans a catalogue
— "is this a marketing course or a video editing course". `refundable` is also
learner-facing, so it appears as a badge, but only when true.

### Property controls

Two, as asked:

| Control | Type | Why |
| --- | --- | --- |
| `title` | String | The section heading — the first thing anyone wants to reword |
| `accentColor` | Color | Carried through one CSS custom property to the category pill, price accent, buttons and focus rings |

Defaults are set as default parameter values rather than `defaultProps`, which React 18.3
deprecates for function components.

A third control for the fallback currency was considered and dropped: the brief asked for
two, and picking two is part of the answer. It stays a named constant at the top of the file.

### Validation

A 200 response does not guarantee usable data. Anything without a name or a numeric price is
dropped, so a malformed entry can never render as `undefined` or `₹NaN`. A response that is
not an array at all is treated as an error, while an array that is simply empty is a
success — those are different situations and get different screens.

---

## Known weaknesses

- Retry timing is a fixed 400ms / 800ms backoff with no jitter. Fine for one component;
  wrong if many clients did it at once.
- The search filters on the client, over the handful of courses already fetched. Correct at
  this size, not an approach that scales.
- **No test suite is committed.** During development every state was forced with a stubbed
  `fetch` — including the partial state, malformed entries, a non-array body, and a retry
  that succeeds on its second attempt — and the price formatting was checked against real
  API responses. But that was a throwaway harness, so nothing in this repo proves it. Making
  it a committed, runnable test is the first thing I would add.
- The skeleton always renders six cards, so on a five-course response one card disappears at
  the moment real data arrives.
- `AbortSignal.any` and `color-mix` both need reasonably current browsers. Fine for 2026,
  but they are the two lines most likely to matter on an old device.

---

## Repo layout

```
src/CoursesSection.tsx   the deliverable — paste this into Framer
preview/                 local dev harness (framer shim, width switcher)
ASSIGNMENT.md            the brief, saved verbatim
```
