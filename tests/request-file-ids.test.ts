import { describe, expect, it } from "vitest";
import { fileIdInUrl, fileIdsInAnswers } from "@/lib/requests/file-ids";

const A = "3878f46f-8327-4cc7-b057-831221c7a782";
const B = "41306ebf-c7a2-4032-b9ef-571902b0ddbf";

describe("fileIdsInAnswers", () => {
  it("finds the file an upload field keeps", () => {
    expect(fileIdsInAnswers({ tz: { url: `/api/admin/files/${A}`, name: 'ת"ז.pdf' } })).toEqual([A]);
  });

  it("finds every file of a multi-upload field, and nested ones", () => {
    const answers = {
      docs: [{ url: `/api/admin/files/${A}` }, { url: `/api/admin/files/${B}` }],
      group: { inner: { url: `/api/admin/files/${A}` } },
    };
    expect(fileIdsInAnswers(answers).sort()).toEqual([A, B].sort());
  });

  it("names each file once even when two fields point at it", () => {
    expect(fileIdsInAnswers({ a: { url: `/files/${A}` }, b: { url: `/api/admin/files/${A}` } })).toEqual([A]);
  });

  it("ignores text that only looks like an id", () => {
    expect(fileIdsInAnswers({ note: A, other: "/files/not-a-uuid" })).toEqual([]);
  });

  it("survives empty, null and answers with no uploads", () => {
    expect(fileIdsInAnswers({})).toEqual([]);
    expect(fileIdsInAnswers(null)).toEqual([]);
    expect(fileIdsInAnswers(undefined)).toEqual([]);
    expect(fileIdsInAnswers({ name: "דנה", amount: 1200 })).toEqual([]);
  });
});

describe("fileIdInUrl", () => {
  it("reads the id a pdf_files row keeps as its url", () => {
    expect(fileIdInUrl(`/api/admin/files/${A}`)).toBe(A);
  });

  it("has nothing for a url that is not a stored file", () => {
    expect(fileIdInUrl("https://blob.vercel-storage.com/x.pdf")).toBeNull();
    expect(fileIdInUrl(null)).toBeNull();
    expect(fileIdInUrl("")).toBeNull();
  });
});
