import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import CoursesSection from "../src/CoursesSection"

// Local-only test rig. None of this ships to Framer — it exists so the breakpoints can be
// checked without dragging a browser window, and so the component can be remounted on
// demand to catch the API's random failures.

const WIDTHS = [
  { label: "Mobile 375", value: 375 },
  { label: "Tablet 768", value: 768 },
  { label: "Desktop 1200", value: 1200 },
  { label: "Full", value: 0 },
]

function Harness() {
  const [width, setWidth] = useState(0)
  // Changing the key remounts the component, which re-runs the fetch from scratch.
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        {WIDTHS.map((option) => (
          <button
            key={option.label}
            onClick={() => setWidth(option.value)}
            style={{
              padding: "6px 10px",
              cursor: "pointer",
              border: "1px solid #d4d4d8",
              borderRadius: 6,
              background: width === option.value ? "#18181b" : "#ffffff",
              color: width === option.value ? "#ffffff" : "#18181b",
            }}
          >
            {option.label}
          </button>
        ))}
        <button
          onClick={() => setReloadKey(reloadKey + 1)}
          style={{
            padding: "6px 10px",
            cursor: "pointer",
            border: "1px solid #d4d4d8",
            borderRadius: 6,
            background: "#ffffff",
          }}
        >
          Remount (refetch)
        </button>
      </div>

      <div
        style={{
          width: width === 0 ? "100%" : width,
          margin: "0 auto",
          outline: "1px dashed #e4e4e7",
        }}
      >
        <CoursesSection key={reloadKey} />
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
)
