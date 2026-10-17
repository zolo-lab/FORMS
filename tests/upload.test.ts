import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, checkUpload } from "@/lib/forms/upload";

describe("checkUpload", () => {
  it("accepts pdf and images up to 10MB", () => {
    expect(checkUpload({ size: 1000, mime: "application/pdf" })).toEqual({ ok: true });
    expect(checkUpload({ size: MAX_UPLOAD_BYTES, mime: "image/jpeg" })).toEqual({ ok: true });
  });
  it("rejects empty, too big and other types", () => {
    expect(checkUpload({ size: 0, mime: "image/png" })).toEqual({ ok: false, error: "empty" });
    expect(checkUpload({ size: MAX_UPLOAD_BYTES + 1, mime: "image/png" })).toEqual({ ok: false, error: "too_big" });
    expect(checkUpload({ size: 10, mime: "text/html" })).toEqual({ ok: false, error: "bad_type" });
    expect(checkUpload({ size: 10, mime: "image/svg+xml" })).toEqual({ ok: false, error: "bad_type" });
  });
});
