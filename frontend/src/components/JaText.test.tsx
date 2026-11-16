import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en, ja } from "../lang";
import { interpolate } from "../utils/interpolate";
import { JaText } from "./JaText";

describe("JaText", () => {
    it("marks Japanese people typed, so it is set upright in --jp inside Latin type", () => {
        const { container } = render(<p>{interpolate(en.reel.endBy, <JaText text="あんじゅ" />)}</p>);
        expect(container.querySelector("p")).toHaveTextContent("That’s everything by あんじゅ.");
        const name = screen.getByText("あんじゅ");
        expect(name).toHaveClass("ja-text");
        expect(name).toHaveAttribute("lang", "ja");
    });

    it("leaves Latin text to the surrounding style", () => {
        const { container } = render(<p><JaText text="lena.ph" /></p>);
        expect(container.querySelector(".ja-text")).toBeNull();
        expect(container).toHaveTextContent("lena.ph");
    });
});

describe("interpolate", () => {
    it("fills each placeholder of a translation, in its own order", () => {
        const { container } = render(<p>{interpolate(ja.filterLine.byTwo, <b>a</b>, <i>b</i>)}</p>);
        expect(container.querySelector("p")).toHaveTextContent("撮影者：a、b");
        expect(screen.getByText("a").tagName).toBe("B");
        expect(screen.getByText("b").tagName).toBe("I");
    });
});
