import { describe, expect, it } from "vitest";
import { isMediaObjectKey, mediaImageUrl } from "../../../shared/utils/media-image";

describe("isMediaObjectKey", () => {
  it("accepts nested plain segments with an image extension only", () => {
    expect(isMediaObjectKey("images/a-b_c.JPG")).toBe(true);
    expect(isMediaObjectKey("/images/a.jpg")).toBe(false);
    expect(isMediaObjectKey("images/../a.jpg")).toBe(false);
    expect(isMediaObjectKey("images/a b.jpg")).toBe(false);
  });
});

describe("mediaImageUrl", () => {
  it("writes the options in one fixed order, cover when both sides are set", () => {
    expect(mediaImageUrl("images/a.jpg", { width: 200, height: 300 })).toBe("/_media/images/a.jpg?w=200&h=300&fit=cover&f=webp&q=75");
  });

  it("names a fit only when both sides are set", () => {
    expect(mediaImageUrl("images/a.jpg", { width: 200, fit: "cover", format: "jpeg", quality: 60 })).toBe("/_media/images/a.jpg?w=200&f=jpeg&q=60");
  });
});
