// Reads the camera and lens names from a photo's EXIF data in the browser,
// so New post can show them before anything is uploaded (DESIGN-SYSTEM.md
// §14, decision 0.3). A port of backend/internal/exifmeta: the same
// containers (JPEG APP1, PNG eXIf, WebP EXIF), the same tags and the same
// clean-up, so the placeholder shows exactly what the server would fill in.
//
// The file is untrusted: every offset is bounds-checked, and anything
// unexpected gives an empty result. Only the start of the file is read.

export type Gear = { camera: string | null; lens: string | null };

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_EXIF_IFD = 0x8769;
const TAG_LENS_MODEL = 0xa434;
const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_IFD = 13;

/** Metadata sits near the start; this bounds what is read from a 32 MB photo. */
const HEAD_BYTES = 512 * 1024;
const MAX_FIELD_CHARS = 100;

const EMPTY: Gear = { camera: null, lens: null };

/** Camera and lens from the photo's EXIF data; nulls when it has none. */
export async function readGear(file: Blob): Promise<Gear> {
    try {
        const buf = await file.slice(0, HEAD_BYTES).arrayBuffer();
        return gearFromBytes(new Uint8Array(buf));
    } catch {
        return EMPTY;
    }
}

export function gearFromBytes(b: Uint8Array): Gear {
    try {
        const tiff = findExif(b);
        if (!tiff) return EMPTY;
        const tags = parseTiff(tiff);
        return {
            camera: cameraBody(tags.get(TAG_MAKE) ?? "", tags.get(TAG_MODEL) ?? "") || null,
            lens: clean(tags.get(TAG_LENS_MODEL) ?? "") || null,
        };
    } catch {
        return EMPTY;
    }
}

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
const u32le = (b: Uint8Array, o: number) => ((b[o + 3] << 24) >>> 0) + ((b[o + 2] << 16) | (b[o + 1] << 8) | b[o]);

const EXIF_HEADER = "Exif\0\0";

function stripExifHeader(b: Uint8Array | null): Uint8Array | null {
    if (b && b.length >= 6 && ascii(b, 0, 6) === EXIF_HEADER) return b.subarray(6);
    return b;
}

function findExif(b: Uint8Array): Uint8Array | null {
    if (b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8) return stripExifHeader(findJpeg(b));
    if (ascii(b, 0, 8) === "\x89PNG\r\n\x1a\n") return stripExifHeader(findPng(b));
    if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return stripExifHeader(findWebp(b));
    return null;
}

function findJpeg(b: Uint8Array): Uint8Array | null {
    let off = 2;
    while (off + 4 <= b.length) {
        if (b[off] !== 0xff) return null;
        const marker = b[off + 1];
        if (marker === 0xff) {
            off++;
            continue;
        }
        if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
            off += 2;
            continue;
        }
        if (marker === 0xda || marker === 0xd9) return null;
        const len = u16be(b, off + 2);
        if (len < 2) return null;
        if (marker === 0xe1 && off + 2 + len <= b.length) {
            const data = b.subarray(off + 4, off + 2 + len);
            if (data.length >= 6 && ascii(data, 0, 6) === EXIF_HEADER) return data;
        }
        off += 2 + len;
    }
    return null;
}

function findPng(b: Uint8Array): Uint8Array | null {
    let off = 8;
    while (off + 8 <= b.length) {
        const len = u32be(b, off);
        const type = ascii(b, off + 4, off + 8);
        if (type === "eXIf") return off + 8 + len <= b.length ? b.subarray(off + 8, off + 8 + len) : null;
        if (type === "IEND") return null;
        off += 12 + len;
    }
    return null;
}

function findWebp(b: Uint8Array): Uint8Array | null {
    let off = 12;
    while (off + 8 <= b.length) {
        const len = u32le(b, off + 4);
        if (ascii(b, off, off + 4) === "EXIF") return off + 8 + len <= b.length ? b.subarray(off + 8, off + 8 + len) : null;
        off += 8 + len + (len & 1);
    }
    return null;
}

function parseTiff(b: Uint8Array): Map<number, string> {
    const tags = new Map<number, string>();
    if (b.length < 8) return tags;
    const order = ascii(b, 0, 2);
    if (order !== "II" && order !== "MM") return tags;
    const le = order === "II";
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const u16 = (o: number) => view.getUint16(o, le);
    const u32 = (o: number) => view.getUint32(o, le);
    if (u16(2) !== 42) return tags;

    function readIfd(off: number, isIfd0: boolean) {
        if (off < 0 || off + 2 > b.length) return;
        const n = u16(off);
        for (let i = 0; i < n; i++) {
            const e = off + 2 + 12 * i;
            if (e + 12 > b.length) return;
            const tag = u16(e);
            const type = u16(e + 2);
            const count = u32(e + 4);
            if (tag === TAG_EXIF_IFD) {
                // One level deep only, so a self-referencing pointer can't loop.
                if (isIfd0 && count === 1 && (type === TYPE_LONG || type === TYPE_IFD)) readIfd(u32(e + 8), false);
            } else if ((tag === TAG_MAKE || tag === TAG_MODEL || tag === TAG_LENS_MODEL) && type === TYPE_ASCII && !tags.has(tag)) {
                if (count <= 4) {
                    tags.set(tag, ascii(b, e + 8, e + 8 + count));
                } else {
                    const start = u32(e + 8);
                    if (start + count <= b.length) tags.set(tag, new TextDecoder("utf-8").decode(b.subarray(start, start + count)));
                }
            }
        }
    }
    readIfd(u32(4), true);
    return tags;
}

/** "SONY ILCE-7C", "Canon EOS R5" (not "Canon Canon EOS R5"), "NIKON Z 6"; a make alone says too little. */
function cameraBody(make: string, model: string): string {
    const m = clean(model);
    if (!m) return "";
    const brand = (clean(make).split(" ")[0] ?? "").replace(/[,.]+$/, "");
    if (!brand || m.toLowerCase().startsWith(brand.toLowerCase())) return m;
    return truncate(`${brand} ${m}`);
}

/** Display text from a raw EXIF value; placeholders without a letter or digit ("----") become "". */
function clean(s: string): string {
    const nul = s.indexOf("\0");
    if (nul >= 0) s = s.slice(0, nul);
    // Control characters and runs of whitespace become single spaces; invalid UTF-8 is dropped.
    const spaced = Array.from(s.replace(/�/g, ""), (ch) => {
        const c = ch.charCodeAt(0);
        return c < 0x20 || (c >= 0x7f && c <= 0x9f) ? " " : ch;
    }).join("");
    s = spaced.split(/\s+/).filter(Boolean).join(" ");
    if (!/[\p{L}\p{N}]/u.test(s)) return "";
    return truncate(s);
}

function truncate(s: string): string {
    const chars = Array.from(s);
    return chars.length <= MAX_FIELD_CHARS ? s : chars.slice(0, MAX_FIELD_CHARS).join("").trim();
}
