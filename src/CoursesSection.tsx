import { useEffect, useState } from "react"
import type { CSSProperties } from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * Skillpath — courses section.
 *
 * Fetches courses and a country code from the assignment API and renders a responsive
 * grid. The API fails ~1 in 4 requests on purpose, so every call is retried and every
 * outcome has a visible state.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 1200
 */

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const API_BASE = "https://syncsphere-hiv6.onrender.com"

// Failures are random per request rather than sustained outages, so a retry usually
// lands. Three attempts takes a ~25% failure rate down to roughly 1.6%.
const MAX_ATTEMPTS = 3

// The API is on a free host that sleeps when idle, and a cold start can take well over
// 20 seconds. A short timeout would abort a request that was going to succeed.
const REQUEST_TIMEOUT_MS = 30000

// Shown when the country lookup fails. The UI says out loud that it fell back, rather
// than presenting a guessed currency as if it were confirmed.
const FALLBACK_COUNTRY: Country = "IN"

const SKELETON_COUNT = 6

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Country = "IN" | "US"

// Only the three fields a card cannot do without are required here, because those are the
// only ones isValidCourse guarantees. The rest are optional so the compiler insists they
// get handled rather than assumed.
type Course = {
  courseName: string
  pricePaise: number
  priceUsdCents: number
  description?: string
  mainCategory?: string
  refundable?: boolean
  courseCode?: string
}

type Status = "loading" | "error" | "ready"

/* ------------------------------------------------------------------ */
/* Reading and formatting the data                                     */
/* ------------------------------------------------------------------ */

/**
 * A 200 response does not guarantee a usable course. Anything without a name or a
 * numeric price cannot be rendered as a card, so it is dropped instead of becoming
 * "undefined" or "₹NaN" on screen.
 */
function isValidCourse(value: unknown): value is Course {
  const course = value as Course
  return (
    typeof course?.courseName === "string" &&
    course.courseName.length > 0 &&
    Number.isFinite(course.pricePaise) &&
    Number.isFinite(course.priceUsdCents)
  )
}

function readCountry(value: unknown): Country | null {
  const code = (value as { country_code?: unknown })?.country_code
  return code === "IN" || code === "US" ? code : null
}

/**
 * Both price fields are in minor units, so they divide by 100.
 * 199900 paise is ₹1,999 and 3999 cents is $39.99.
 */
function priceInMinorUnits(course: Course, country: Country): number {
  return country === "US" ? course.priceUsdCents : course.pricePaise
}

function formatPrice(course: Course, country: Country): string {
  const amount = priceInMinorUnits(course, country) / 100

  if (country === "US") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    // Whole rupees read better without ".00", but a real paise remainder must survive.
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
}

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * One GET. No headers and no other method: the API answers 405 to everything except GET,
 * and a bare GET also stays a CORS "simple request" so the browser skips the preflight.
 */
async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(API_BASE + path, {
    // Aborts when the component unmounts or when the request runs long, whichever first.
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    // The course count is meant to vary between calls, so a cached body would hide that.
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`${path} responded with ${response.status}`)
  }

  return response.json()
}

/**
 * Retries a failed GET a fixed number of times with a growing pause between attempts.
 * The cap matters: after the last attempt the error is rethrown so the UI can show it,
 * rather than retrying forever and leaving the section stuck on "loading".
 */
async function getJsonWithRetry(path: string, signal: AbortSignal): Promise<unknown> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await getJson(path, signal)
    } catch (error) {
      lastError = error

      // The component went away mid-flight. Retrying would be pointless work.
      if (signal.aborted) throw error

      if (attempt < MAX_ATTEMPTS) {
        await delay(attempt * 400)
      }
    }
  }

  throw lastError
}

/* ------------------------------------------------------------------ */
/* Data hook                                                           */
/* ------------------------------------------------------------------ */

function useCourseData(reloadCount: number) {
  const [status, setStatus] = useState<Status>("loading")
  const [courses, setCourses] = useState<Course[]>([])
  // null means the lookup failed and the displayed currency is a fallback, not a fact.
  const [country, setCountry] = useState<Country | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setStatus("loading")

    async function load() {
      // allSettled, not all: the two calls fail independently, and a failed country
      // lookup must never take the course grid down with it.
      const [coursesResult, countryResult] = await Promise.allSettled([
        getJsonWithRetry("/assignment/course-data", controller.signal),
        getJsonWithRetry("/assignment/country-code", controller.signal),
      ])

      if (controller.signal.aborted) return

      setCountry(
        countryResult.status === "fulfilled" ? readCountry(countryResult.value) : null
      )

      // A rejected call or a body that is not an array both mean "no usable data".
      // An array that is simply empty is a different thing and stays a success.
      if (coursesResult.status === "rejected" || !Array.isArray(coursesResult.value)) {
        setStatus("error")
        return
      }

      setCourses(coursesResult.value.filter(isValidCourse))
      setStatus("ready")
    }

    load()

    return () => controller.abort()
  }, [reloadCount])

  return { status, courses, country }
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

// Kept in a stylesheet rather than inline styles because container queries, line
// clamping and keyframes cannot be expressed as inline style objects.
const CSS = `
.sp-root {
  /* Breakpoints below measure this element, not the viewport, so the grid stays
     correct even when the component sits in a narrow column. */
  container-type: inline-size;
  font-family: inherit;
  color: #18181b;
}
/* Wrapper keeps the gap below the header the same whether or not the count line
   is showing, so the layout does not shift when the data arrives. */
.sp-header { margin-bottom: 28px; }
.sp-heading {
  font-size: 32px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.025em;
}
.sp-subheading { font-size: 15px; color: #71717a; margin: 0; }

.sp-toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 28px; }
.sp-search, .sp-sort {
  font: inherit; font-size: 14px; color: #18181b; background: #fff;
  border: 1px solid #e4e4e7; border-radius: 10px; padding: 11px 14px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.sp-search { flex: 1 1 240px; min-width: 0; }
.sp-sort { cursor: pointer; }
.sp-search:focus-visible, .sp-sort:focus-visible {
  outline: none; border-color: var(--sp-accent);
  /* Soft ring instead of a hard outline — reads as a focus state, not an error. */
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sp-accent) 18%, transparent);
}

.sp-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@container (min-width: 640px) { .sp-grid { grid-template-columns: repeat(2, 1fr); } }
@container (min-width: 960px) { .sp-grid { grid-template-columns: repeat(3, 1fr); } }

.sp-card {
  display: flex; flex-direction: column; gap: 12px;
  min-width: 0; /* lets a grid item shrink instead of overflowing its column */
  padding: 24px; background: #fff;
  border: 1px solid #ececef; border-radius: 16px;
  box-shadow: 0 1px 2px rgba(16, 16, 20, 0.04);
  transition: box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease;
}
.sp-card:hover {
  border-color: #e0e0e6;
  box-shadow: 0 6px 20px rgba(16, 16, 20, 0.07);
  transform: translateY(-2px);
}

.sp-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.sp-pill, .sp-refundable {
  font-size: 12px; font-weight: 500; letter-spacing: 0.01em;
  padding: 5px 10px; border-radius: 6px;
}
.sp-pill {
  color: var(--sp-accent); background: color-mix(in srgb, var(--sp-accent) 9%, transparent);
}
.sp-refundable { color: #15803d; background: #f0fdf4; }

.sp-name {
  font-size: 18px; font-weight: 600; line-height: 1.35; margin: 0;
  letter-spacing: -0.015em; overflow-wrap: anywhere;
}
.sp-description {
  font-size: 14px; line-height: 1.6; color: #71717a; margin: 0;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; overflow-wrap: anywhere;
}
/* Pushes the price to the bottom so cards with shorter text still line up. */
.sp-price {
  margin-top: auto; padding-top: 14px; border-top: 1px solid #f4f4f5;
  font-size: 20px; font-weight: 600; letter-spacing: -0.02em;
  /* Equal-width digits, so prices line up column to column. */
  font-variant-numeric: tabular-nums;
}

.sp-message {
  padding: 48px 24px; text-align: center; border: 1px dashed #e4e4e7;
  border-radius: 16px; background: #fcfcfd; color: #71717a; font-size: 15px;
}
.sp-notice {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
  margin-bottom: 24px; padding: 14px 16px; border-radius: 12px;
  background: #fffbeb; border: 1px solid #fde68a; color: #854d0e; font-size: 14px;
}
.sp-button {
  font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  padding: 10px 18px; border-radius: 10px; border: none;
  color: #fff; background: var(--sp-accent);
  transition: opacity 150ms ease;
}
.sp-button:hover { opacity: 0.88; }

.sp-skeleton-line {
  border-radius: 6px; background: #eeeef1;
  animation: sp-pulse 1.5s ease-in-out infinite;
}
@keyframes sp-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
@media (prefers-reduced-motion: reduce) {
  .sp-skeleton-line { animation: none }
  .sp-card { transition: none }
  .sp-card:hover { transform: none }
}
`

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="sp-card" aria-hidden="true">
      <div className="sp-skeleton-line" style={{ height: 20, width: "35%" }} />
      <div className="sp-skeleton-line" style={{ height: 18, width: "75%" }} />
      <div className="sp-skeleton-line" style={{ height: 14 }} />
      <div className="sp-skeleton-line" style={{ height: 14, width: "60%" }} />
      <div className="sp-skeleton-line" style={{ height: 26, width: "40%", marginTop: 10 }} />
    </div>
  )
}

function CourseCard({ course, country }: { course: Course; country: Country }) {
  return (
    <article className="sp-card">
      <div className="sp-badges">
        {course.mainCategory && <span className="sp-pill">{course.mainCategory}</span>}
        {course.refundable && <span className="sp-refundable">Refundable</span>}
      </div>
      <h3 className="sp-name">{course.courseName}</h3>
      <p className="sp-description">{course.description}</p>
      <div className="sp-price">{formatPrice(course, country)}</div>
    </article>
  )
}

function Message({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="sp-message">
      <p style={{ margin: 0 }}>{text}</p>
      {onRetry && (
        <button className="sp-button" style={{ marginTop: 16 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

type Props = {
  title?: string
  accentColor?: string
}

export default function CoursesSection({
  title = "Courses built to be finished",
  accentColor = "#4f46e5",
}: Props) {
  // Bumped by the retry buttons; the data hook watches it and refetches.
  const [reloadCount, setReloadCount] = useState(0)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("default")

  const { status, courses, country } = useCourseData(reloadCount)

  // What the prices are actually shown in. Falls back when the lookup failed.
  const displayCountry = country ?? FALLBACK_COUNTRY

  const search = query.trim().toLowerCase()
  const visible = courses.filter((course) => {
    if (search === "") return true
    // mainCategory is optional decoration, not something a card is dropped for missing,
    // so it is treated as empty rather than assumed to be a string.
    const category = course.mainCategory ?? ""
    return (
      course.courseName.toLowerCase().includes(search) ||
      category.toLowerCase().includes(search)
    )
  })

  // Sorting compares the raw minor-unit integers. Comparing formatted prices would sort
  // them as text, where "₹1,499" comes before "₹999".
  if (sort !== "default") {
    visible.sort((a, b) => {
      const difference =
        priceInMinorUnits(a, displayCountry) - priceInMinorUnits(b, displayCountry)
      return sort === "high" ? -difference : difference
    })
  }

  const retry = () => setReloadCount(reloadCount + 1)

  // One CSS custom property carries the accent to every rule that needs it.
  // The cast is needed only because CSSProperties has no entry for custom properties.
  const rootStyle = { "--sp-accent": accentColor } as CSSProperties

  return (
    <section className="sp-root" style={rootStyle}>
      <style>{CSS}</style>

      <header className="sp-header">
        <h2 className="sp-heading">{title}</h2>
        {status === "ready" && courses.length > 0 && (
          <p className="sp-subheading">
            {visible.length} {visible.length === 1 ? "course" : "courses"}
          </p>
        )}
      </header>

      {status === "ready" && country === null && (
        <div className="sp-notice">
          <span>
            We couldn’t confirm your region, so prices are shown in{" "}
            {FALLBACK_COUNTRY === "US" ? "US dollars" : "Indian rupees"}.
          </span>
          <button className="sp-button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {status === "ready" && courses.length > 0 && (
        <div className="sp-toolbar">
          <input
            className="sp-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
          />
          <select
            className="sp-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Sort courses"
          >
            <option value="default">Sort: featured</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
        </div>
      )}

      {status === "loading" && (
        <div className="sp-grid">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      )}

      {status === "error" && (
        <Message
          text="We couldn’t load the courses just now. This usually clears on a second try."
          onRetry={retry}
        />
      )}

      {status === "ready" && courses.length === 0 && (
        <Message text="There are no courses available right now. Please check back soon." />
      )}

      {status === "ready" && courses.length > 0 && visible.length === 0 && (
        <Message text={`No courses match “${query.trim()}”.`} />
      )}

      {status === "ready" && visible.length > 0 && (
        <div className="sp-grid">
          {visible.map((course, index) => (
            <CourseCard
              key={course.courseCode || index}
              course={course}
              country={displayCountry}
            />
          ))}
        </div>
      )}
    </section>
  )
}

addPropertyControls(CoursesSection, {
  title: {
    type: ControlType.String,
    title: "Title",
    defaultValue: "Courses built to be finished",
  },
  accentColor: {
    type: ControlType.Color,
    title: "Accent",
    defaultValue: "#4f46e5",
  },
})
