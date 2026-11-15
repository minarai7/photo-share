// The new-post page takes its cover's colour before anything is uploaded.
// This mirrors backend/internal/tint (the colour the server will store) for
// the preview only; the server computes the real one from the thumbnail.

const LIGHTNESS = 0.9;
const MAX_SATURATION = 0.45;
const SATURATION_BOOST = 1.3;
const MUTED_ALPHA = 0.55; // --muted
const MIN_CONTRAST = 4.5;

/** The pale page colour for an image, or null when it can't be read (no canvas). */
export function previewTint(img: HTMLImageElement): string | null {
    try {
        const canvas = document.createElement("canvas");
        const side = 48;
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx || !img.naturalWidth) return null;
        ctx.drawImage(img, 0, 0, side, side);
        const data = ctx.getImageData(0, 0, side, side).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3] / 255;
            r += (data[i] / 255) * a;
            g += (data[i + 1] / 255) * a;
            b += (data[i + 2] / 255) * a;
            n += a;
        }
        if (n === 0) return null;
        return tintFromColor(r / n, g / n, b / n);
    } catch {
        return null;
    }
}

export function tintFromColor(r: number, g: number, b: number): string {
    const [h, s0] = rgbToHsl(r, g, b);
    const s = Math.min(s0 * SATURATION_BOOST, MAX_SATURATION);
    for (let l = LIGHTNESS; ; l += 0.005) {
        const hex = toHex(...hslToRgb(h, s, Math.min(l, 1)));
        if (l >= 1 || mutedContrast(hex) >= MIN_CONTRAST) return hex;
    }
}

function mutedContrast(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const keep = 1 - MUTED_ALPHA;
    return (luminance(r, g, b) + 0.05) / (luminance(r * keep, g * keep, b * keep) + 0.05);
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (r: number, g: number, b: number) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const to8 = (c: number) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0");
const toHex = (r: number, g: number, b: number) => `#${to8(r)}${to8(g)}${to8(b)}`;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    const l = (hi + lo) / 2;
    const d = hi - lo;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m];
}
