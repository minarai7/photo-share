import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { concat, jpeg, png, text, tiff, webp } from "../test/exifBytes";
import { gearFromBytes, readGear } from "./exif";

const sony = tiff(
    [{ tag: 0x010f, value: "SONY" }, { tag: 0x0110, value: "ILCE-7C" }],
    [{ tag: 0xa434, value: "FE 35mm F1.8" }],
);

describe("gearFromBytes", () => {
    it.each([
        ["JPEG", jpeg(sony)],
        ["PNG", png(sony)],
        ["WebP", webp(sony)],
    ])("reads camera and lens from %s", (_, bytes) => {
        expect(gearFromBytes(bytes)).toEqual({ camera: "SONY ILCE-7C", lens: "FE 35mm F1.8" });
    });

    it("reads big-endian TIFF", () => {
        const t = tiff([{ tag: 0x010f, value: "NIKON CORPORATION" }, { tag: 0x0110, value: "NIKON Z 6" }], [], false);
        expect(gearFromBytes(jpeg(t))).toEqual({ camera: "NIKON Z 6", lens: null });
    });

    it("joins make and model the way people write them", () => {
        const g = (make: string, model: string) =>
            gearFromBytes(jpeg(tiff([{ tag: 0x010f, value: make }, { tag: 0x0110, value: model }], []))).camera;
        expect(g("Canon", "Canon EOS R5")).toBe("Canon EOS R5");
        expect(g("FUJIFILM", "X-T5")).toBe("FUJIFILM X-T5");
        expect(g("OLYMPUS IMAGING CORP.", "E-M10")).toBe("OLYMPUS E-M10");
        expect(g("SONY", "")).toBeNull();
    });

    it("drops placeholders and tidies whitespace", () => {
        const t = tiff([{ tag: 0x0110, value: "  X100V \t" }], [{ tag: 0xa434, value: "----" }]);
        expect(gearFromBytes(jpeg(t))).toEqual({ camera: "X100V", lens: null });
    });

    it.each([
        ["empty", new Uint8Array()],
        ["not an image", text("hello world, this is text")],
        ["JPEG without EXIF", concat([0xff, 0xd8], [0xff, 0xda, 0, 2])],
        ["truncated EXIF", jpeg(sony).subarray(0, 40)],
        ["bad TIFF offsets", jpeg(concat(text("II"), [42, 0, 0xff, 0xff, 0xff, 0x7f]))],
    ])("gives nothing for %s", (_, bytes) => {
        expect(gearFromBytes(bytes)).toEqual({ camera: null, lens: null });
    });
});

describe("readGear", () => {
    it("reads a file", async () => {
        const file = new Blob([jpeg(sony) as BlobPart, new Uint8Array(2048)]);
        expect(await readGear(file)).toEqual({ camera: "SONY ILCE-7C", lens: "FE 35mm F1.8" });
    });

    // The Unsplash samples in testfiles/ were stripped (their gear is only in
    // the filename): a real JPEG with no EXIF reads as nothing, not an error.
    it("reads a real JPEG without EXIF as nothing", async () => {
        const path = resolve(__dirname, "../../../testfiles/flower.jpg");
        expect(await readGear(new Blob([new Uint8Array(readFileSync(path))]))).toEqual({ camera: null, lens: null });
    });

    it("never throws on a file it can't read", async () => {
        expect(await readGear(new Blob([text("x")]))).toEqual({ camera: null, lens: null });
    });
});
