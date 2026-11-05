import { describe, expect, it } from "vitest";
import { describeTarget, filesForDestination, filesForItem, recipientsFor, skipReason, type PeopleLookup, type RequestFiles } from "@/lib/processing/deliver";
import type { Destination } from "@/lib/processing/types";

const files: RequestFiles = {
  documents: [
    { documentId: "d1", templateId: "tpl-1", fileId: "f-doc1", title: "קליטת עובד" },
    { documentId: "d2", templateId: "tpl-2", fileId: "f-doc2", title: "הסכם" },
  ],
  parts: [
    { documentId: "p1", partId: "a", fileId: "f-101", name: "101", pages: "1-2" },
    { documentId: "p2", partId: "b", fileId: null, name: "לא נוצר", pages: "3" },
  ],
  uploads: [
    { fieldId: "tz", fileId: "f-tz", name: "צילום ת\"ז.pdf" },
    { fieldId: "bank", fileId: "f-bank", name: "אישור בנק.pdf" },
  ],
};

const dest = (over: Partial<Destination> = {}): Destination =>
  ({ id: "d", kind: "email", attach: true, to: [], items: [], ...over }) as Destination;

describe("filesForItem", () => {
  it("takes every whole document when no document is named", () => {
    expect(filesForItem({ kind: "full" }, files).map((f) => f.fileId)).toEqual(["f-doc1", "f-doc2"]);
  });

  it("takes only the named document", () => {
    expect(filesForItem({ kind: "full", documentId: "tpl-2" }, files).map((f) => f.name)).toEqual(["הסכם.pdf"]);
  });

  it("takes a part by its id and names the file after the part", () => {
    expect(filesForItem({ kind: "part", partId: "a" }, files)).toEqual([
      { documentId: "p1", fileId: "f-101", name: "101.pdf", cut: { pages: "1-2", sourcePages: undefined } },
    ]);
  });

  it("leaves out a part that has no file yet instead of sending a broken reference", () => {
    expect(filesForItem({ kind: "part", partId: "b" }, files)).toEqual([]);
  });

  it("takes one upload, or every upload with *", () => {
    expect(filesForItem({ kind: "attachment", fieldId: "tz" }, files).map((f) => f.fileId)).toEqual(["f-tz"]);
    expect(filesForItem({ kind: "attachment", fieldId: "*" }, files).map((f) => f.fileId)).toEqual(["f-tz", "f-bank"]);
  });

  it("returns nothing for a field that no longer exists", () => {
    expect(filesForItem({ kind: "attachment", fieldId: "gone" }, files)).toEqual([]);
  });
});

describe("a part downloaded by hand and a part sent to a destination", () => {
  it("are the same file: the download picks it with filesForItem, exactly as a destination does", () => {
    const d = dest({ items: [{ kind: "part", partId: "a" }] });
    expect(filesForItem({ kind: "part", partId: "a" }, files)).toEqual(filesForDestination(d, files));
  });

  it("offers nothing to download for a part whose document is not signed yet", () => {
    expect(filesForItem({ kind: "part", partId: "b" }, files)).toEqual([]);
  });
});

describe("filesForDestination", () => {
  it("sends each file once even when two items name it", () => {
    const d = dest({ items: [{ kind: "full" }, { kind: "full", documentId: "tpl-1" }] });
    expect(filesForDestination(d, files).map((f) => f.fileId)).toEqual(["f-doc1", "f-doc2"]);
  });

  it("combines a part and an upload", () => {
    const d = dest({ items: [{ kind: "part", partId: "a" }, { kind: "attachment", fieldId: "tz" }] });
    expect(filesForDestination(d, files).map((f) => f.name)).toEqual(["101.pdf", "צילום ת\"ז.pdf"]);
  });
});

const look: PeopleLookup = {
  byRole: { employee: [{ name: "דנה", email: "dana@x.il" }], secretariat: [{ name: "מזכירות", email: "sec@x.il" }] },
  byStep: { approver: { name: "משה", email: "moshe@x.il" } },
  byField: { mgr_mail: "mgr@x.il", empty_mail: undefined },
  byUser: { u1: { name: "רות", email: "ruth@x.il" } },
};

describe("recipientsFor", () => {
  it("resolves every kind of reference", () => {
    const got = recipientsFor(
      [{ kind: "role", role: "employee" }, { kind: "step", role: "approver" }, { kind: "field", fieldId: "mgr_mail" }, { kind: "user", userId: "u1" }, { kind: "fixed", name: "שכר", email: "pay@x.il" }],
      look,
    );
    expect(got.map((p) => p.email)).toEqual(["dana@x.il", "moshe@x.il", "mgr@x.il", "ruth@x.il", "pay@x.il"]);
  });

  it("mails a person named twice only once", () => {
    const got = recipientsFor([{ kind: "role", role: "employee" }, { kind: "fixed", name: "דנה שוב", email: "DANA@x.il" }], look);
    expect(got).toEqual([{ name: "דנה", email: "dana@x.il" }]);
  });

  it("drops references that resolve to nothing, and invalid addresses", () => {
    const got = recipientsFor(
      [{ kind: "field", fieldId: "empty_mail" }, { kind: "step", role: "approver6" }, { kind: "user", userId: "gone" }, { kind: "fixed", name: "x", email: "not-an-email" }],
      look,
    );
    expect(got).toEqual([]);
  });

  it("falls back to the address as the name", () => {
    expect(recipientsFor([{ kind: "fixed", name: "", email: "a@b.il" }], look)).toEqual([{ name: "a@b.il", email: "a@b.il" }]);
  });
});

describe("describeTarget", () => {
  it("names a Drive path, a webhook, and the people on a mail", () => {
    expect(describeTarget(dest({ kind: "drive", path: "שכר/{שנה}" }), [])).toBe("שכר/{שנה}");
    expect(describeTarget(dest({ kind: "webhook", webhookId: "w" }), [])).toBe("webhook");
    expect(describeTarget(dest(), [{ name: "שכר", email: "p@x.il" }, { name: "h@x.il", email: "h@x.il" }])).toBe("שכר <p@x.il>, h@x.il");
  });
});

describe("skipReason", () => {
  it("says when there is nothing to send", () => {
    expect(skipReason(dest(), [], [{ name: "a", email: "a@b.il" }])).toMatch(/אין קבצים/);
  });

  it("says when a mail has no valid recipient", () => {
    expect(skipReason(dest(), [{ fileId: "f", name: "x" }], [])).toBe("אין נמען תקין");
  });

  it("is silent when the destination is ready", () => {
    expect(skipReason(dest(), [{ fileId: "f", name: "x" }], [{ name: "a", email: "a@b.il" }])).toBeNull();
  });

  it("does not demand recipients for a Drive destination", () => {
    expect(skipReason(dest({ kind: "drive", path: "x" }), [{ fileId: "f", name: "x" }], [])).toBeNull();
  });
});
