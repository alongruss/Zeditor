/**
 * Hex color helpers. Colors are stored as CSS hex strings: `#rgb`, `#rgba`,
 * `#rrggbb` or `#rrggbbaa`, where the last two digits are alpha (opacity).
 * zdog passes them straight to SVG or canvas, which both understand alpha.
 */

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(text: string): boolean {
  return HEX_COLOR.test(text);
}

/** Any hex color as lower-case `#rrggbbaa` (alpha `ff` if it had none), or null if not hex. */
function fullHex(color: string): string | null {
  if (!isHexColor(color)) return null;
  let digits = color.slice(1).toLowerCase();
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
  if (digits.length === 6) digits += 'ff';
  return `#${digits}`;
}

const byteHex = (byte: number) => byte.toString(16).padStart(2, '0');

/**
 * Builds a color from `#rrggbb` and an alpha byte (0–255). Fully opaque
 * colors keep the short `#rrggbb` form.
 */
function withAlphaByte(rgb: string, alpha: number): string {
  const byte = Math.round(Math.min(255, Math.max(0, alpha)));
  return byte === 255 ? rgb : rgb + byteHex(byte);
}

/** The `#rrggbb` part of a color, for `<input type="color">`. Non-hex colors give black. */
export function toPickerHex(color: string): string {
  return fullHex(color)?.slice(0, 7) ?? '#000000';
}

/** A color's alpha as a whole percentage (100 = solid), or null if it isn't a hex color. */
export function alphaPercent(color: string): number | null {
  const full = fullHex(color);
  return full === null ? null : Math.round((parseInt(full.slice(7), 16) * 100) / 255);
}

/** The same color with its alpha set to `percent` (0–100). Non-hex colors come back unchanged. */
export function withAlphaPercent(color: string, percent: number): string {
  const full = fullHex(color);
  return full === null ? color : withAlphaByte(full.slice(0, 7), (percent * 255) / 100);
}

/** Applies a color picked as `#rrggbb` but keeps the alpha the previous color had. */
export function withAlphaOf(picked: string, previous: string): string {
  const pickedFull = fullHex(picked);
  const previousFull = fullHex(previous);
  if (pickedFull === null || previousFull === null) return picked;
  return withAlphaByte(pickedFull.slice(0, 7), parseInt(previousFull.slice(7), 16));
}

/**
 * The color as seen at `opacity` (0–1): its alpha is multiplied by it.
 * Opacity 1, and non-hex colors, leave the color as it is.
 */
export function fadeColor(color: string, opacity: number): string {
  const full = fullHex(color);
  if (full === null || opacity >= 1) return color;
  return withAlphaByte(full.slice(0, 7), parseInt(full.slice(7), 16) * Math.max(0, opacity));
}
