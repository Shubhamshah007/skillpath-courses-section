// Stand-in for Framer's runtime, used only by the local preview (see vite.config.ts).
// Property controls are a canvas-editor feature, so outside Framer they do nothing.

export function addPropertyControls(..._args: unknown[]): void {}

export const ControlType = {
  String: "string",
  Number: "number",
  Boolean: "boolean",
  Color: "color",
  Enum: "enum",
} as const
