// Builds image files with EXIF data for tests, the containers
// utils/exif.ts reads: JPEG APP1, PNG eXIf, WebP EXIF.

type Entry = { tag: number; value: string };

export const TAG = { make: 0x010f, model: 0x0110, lensModel: 0xa434 };

/** A TIFF block with IFD0 (Make, Model, a pointer to the Exif IFD) and the Exif IFD (LensModel). */
export function tiff(ifd0: Entry[], exif: Entry[], littleEndian = true): Uint8Array {
    const entries = (n: number) => 2 + 12 * n + 4;
    const ifd0Count = ifd0.length + (exif.length ? 1 : 0);
    const ifd0Off = 8;
    const exifOff = ifd0Off + entries(ifd0Count);
    let dataOff = exifOff + (exif.length ? entries(exif.length) : 0);
    const enc = new TextEncoder();
    const blobs: { off: number; bytes: Uint8Array }[] = [];
    const size = dataOff + [...ifd0, ...exif].reduce((n, e) => n + enc.encode(e.value).length + 1, 0);
    const buf = new Uint8Array(size);
    const v = new DataView(buf.buffer);
    buf.set(enc.encode(littleEndian ? "II" : "MM"), 0);
    v.setUint16(2, 42, littleEndian);
    v.setUint32(4, ifd0Off, littleEndian);

    function writeIfd(off: number, list: Entry[], pointer?: number) {
        v.setUint16(off, list.length + (pointer ? 1 : 0), littleEndian);
        let e = off + 2;
        for (const { tag, value } of list) {
            const bytes = enc.encode(value + "\0");
            v.setUint16(e, tag, littleEndian);
            v.setUint16(e + 2, 2, littleEndian); // ASCII
            v.setUint32(e + 4, bytes.length, littleEndian);
            if (bytes.length <= 4) buf.set(bytes, e + 8);
            else {
                v.setUint32(e + 8, dataOff, littleEndian);
                blobs.push({ off: dataOff, bytes });
                dataOff += bytes.length;
            }
            e += 12;
        }
        if (pointer) {
            v.setUint16(e, 0x8769, littleEndian);
            v.setUint16(e + 2, 4, littleEndian);
            v.setUint32(e + 4, 1, littleEndian);
            v.setUint32(e + 8, pointer, littleEndian);
        }
    }
    writeIfd(ifd0Off, ifd0, exif.length ? exifOff : undefined);
    if (exif.length) writeIfd(exifOff, exif);
    for (const { off, bytes } of blobs) buf.set(bytes, off);
    return buf;
}

export const concat = (...parts: (Uint8Array | number[])[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
};

export const text = (s: string) => new TextEncoder().encode(s);

export function jpeg(t: Uint8Array): Uint8Array {
    const payload = concat(text("Exif\0\0"), t);
    const len = payload.length + 2;
    return concat([0xff, 0xd8], [0xff, 0xe0, 0, 4, 0, 0], [0xff, 0xe1, len >> 8, len & 0xff], payload, [0xff, 0xda, 0, 2]);
}

export function png(t: Uint8Array): Uint8Array {
    const len = [(t.length >>> 24) & 0xff, (t.length >>> 16) & 0xff, (t.length >>> 8) & 0xff, t.length & 0xff];
    return concat([0x89], text("PNG\r\n\x1a\n"), [0, 0, 0, 0], text("IHDR"), [0, 0, 0, 0], len, text("eXIf"), t, [0, 0, 0, 0], [0, 0, 0, 0], text("IEND"), [0, 0, 0, 0]);
}

export function webp(t: Uint8Array): Uint8Array {
    const le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    const pad = t.length & 1 ? [0] : [];
    return concat(text("RIFF"), le(0), text("WEBP"), text("VP8X"), le(2), [0, 0], text("EXIF"), le(t.length), t, pad);
}

/** A JPEG file whose EXIF records this camera (Make + Model) and lens. */
export function jpegWithGear(name: string, make: string, model: string, lens?: string): File {
    const t = tiff([{ tag: TAG.make, value: make }, { tag: TAG.model, value: model }], lens ? [{ tag: TAG.lensModel, value: lens }] : []);
    return new File([jpeg(t) as BlobPart], name, { type: "image/jpeg" });
}
