import { describe, expect, it } from "vitest";
import {
  completionDestination,
  describeDestination,
  describeProcessing,
  destinationProblems,
  itemLabel,
  normalizeProcessing,
  recipientLabel,
  splitProcessing,
  viewProcessing,
  type ProcessingContext,
} from "@/lib/processing/model";
import { COMPLETION_DESTINATION_ID, type Destination, type Processing } from "@/lib/processing/types";

const ctx: ProcessingContext = {
  parts: [{ id: "p1", name: "101", pages: "1-2" }],
  attachments: [{ id: "tz", label: "צילום ת\"ז" }],
  steps: [{ role: "employee", label: "העובד" }],
  emailFields: [{ id: "mgr_mail", label: "מייל מנהל" }],
  users: [{ id: "u1", label: "רות לוי" }],
  webhooks: [{ id: "w1", label: "פריוריטי" }],
};

const email = (over: Partial<Destination> = {}): Destination =>
  ({ id: "d1", kind: "email", attach: true, items: [{ kind: "full" }], to: [{ kind: "fixed", name: "שכר", email: "payroll@x.org.il" }], ...over }) as Destination;

describe("normalizeProcessing", () => {
  it("returns an empty value for anything that is not an object", () => {
    for (const v of [null, undefined, 7, "x", []]) expect(normalizeProcessing(v)).toEqual({ parts: [], destinations: [] });
  });

  it("drops destinations and items it cannot read instead of throwing", () => {
    const p = normalizeProcessing({
      parts: [{ id: "p1", name: "101", pages: "1-2" }, { name: "בלי מזהה" }, 5],
      destinations: [
        { id: "d1", kind: "email", to: [{ kind: "fixed", email: "A@B.IL" }, { kind: "nope" }], items: [{ kind: "full" }, { kind: "part" }] },
        { id: "d2", kind: "banana" },
        { kind: "email" },
      ],
    });
    expect(p.parts).toHaveLength(1);
    expect(p.destinations).toHaveLength(1);
    const d = p.destinations[0]!;
    expect(d.kind === "email" && d.to).toEqual([{ kind: "fixed", name: "a@b.il", email: "a@b.il" }]);
    expect(d.items).toEqual([{ kind: "full" }]);
  });

  it("never keeps a stored copy of the completion destination", () => {
    const p = normalizeProcessing({ destinations: [{ id: COMPLETION_DESTINATION_ID, kind: "email", to: [], items: [] }, { id: "d9", kind: "webhook", webhookId: "w1", items: [] }] });
    expect(p.destinations.map((d) => d.id)).toEqual(["d9"]);
  });

  it("defaults attach to true but keeps an explicit false", () => {
    expect(normalizeProcessing({ destinations: [{ id: "d1", kind: "email", to: [], items: [] }] }).destinations[0]).toMatchObject({ attach: true });
    expect(normalizeProcessing({ destinations: [{ id: "d1", kind: "email", attach: false, to: [], items: [] }] }).destinations[0]).toMatchObject({ attach: false });
  });
});

describe("the completion destination mirrors completionRecipients", () => {
  it("is built from the package column, in front of the stored destinations", () => {
    const view = viewProcessing({ destinations: [{ id: "d2", kind: "drive", path: "x", items: [] }] }, [{ name: "שכר", email: "payroll@x.org.il" }]);
    expect(view.destinations[0]!.id).toBe(COMPLETION_DESTINATION_ID);
    expect(view.destinations[1]!.id).toBe("d2");
  });

  it("round-trips: what the tab shows splits back into the same two values", () => {
    const stored: Processing = { parts: [{ id: "p1", name: "101", pages: "1-2" }], destinations: [email({ id: "d2" })] };
    const recipients = [{ name: "שכר", email: "payroll@x.org.il" }];
    const back = splitProcessing(viewProcessing(stored, recipients));
    expect(back.processing).toEqual(stored);
    expect(back.completionRecipients).toEqual(recipients);
  });

  it("writes edits of the completion card back to completionRecipients", () => {
    const view = viewProcessing({}, [{ name: "שכר", email: "payroll@x.org.il" }]);
    const edited: Processing = {
      ...view,
      destinations: view.destinations.map((d) => (d.id === COMPLETION_DESTINATION_ID ? ({ ...d, kind: "email", to: [{ kind: "fixed", name: "משאבי אנוש", email: "HR@x.org.il" }] } as Destination) : d)),
    };
    expect(splitProcessing(edited).completionRecipients).toEqual([{ name: "משאבי אנוש", email: "hr@x.org.il" }]);
    expect(splitProcessing(edited).processing.destinations).toEqual([]);
  });

  it("drops duplicates and blank addresses, and falls back to the address as the name", () => {
    const d = completionDestination([]);
    const edited: Processing = {
      parts: [],
      destinations: [{ ...d, kind: "email", attach: true, items: [{ kind: "full" }], to: [
        { kind: "fixed", name: "", email: "a@b.il" },
        { kind: "fixed", name: "שוב", email: "A@B.IL" },
        { kind: "fixed", name: "ריק", email: "  " },
        { kind: "role", role: "employee" },
      ] } as Destination],
    };
    expect(splitProcessing(edited).completionRecipients).toEqual([{ name: "a@b.il", email: "a@b.il" }]);
  });
});

describe("labels", () => {
  it("names each kind of item", () => {
    expect(itemLabel({ kind: "full" }, ctx)).toBe("המסמך החתום המלא");
    expect(itemLabel({ kind: "part", partId: "p1" }, ctx)).toBe("101");
    expect(itemLabel({ kind: "attachment", fieldId: "*" }, ctx)).toBe("כל המסמכים הנלווים");
    expect(itemLabel({ kind: "attachment", fieldId: "tz" }, ctx)).toBe("צילום ת\"ז");
  });

  it("says plainly when the thing it points at is gone", () => {
    expect(itemLabel({ kind: "part", partId: "nope" }, ctx)).toBe("חלק שנמחק");
    expect(recipientLabel({ kind: "step", role: "approver6" }, ctx)).toBe("שלב שנמחק");
    expect(recipientLabel({ kind: "field", fieldId: "nope" }, ctx)).toBe("שדה שנמחק");
  });

  it("names recipients by what they are", () => {
    expect(recipientLabel({ kind: "role", role: "employee" }, ctx)).toBe("העובד");
    expect(recipientLabel({ kind: "user", userId: "u1" }, ctx)).toBe("רות לוי");
    expect(recipientLabel({ kind: "step", role: "employee" }, ctx)).toBe("העובד");
    expect(recipientLabel({ kind: "fixed", name: "שכר", email: "p@x.il" }, ctx)).toBe("שכר <p@x.il>");
    expect(recipientLabel({ kind: "fixed", name: "p@x.il", email: "p@x.il" }, ctx)).toBe("p@x.il");
  });

  it("describes a destination in one line", () => {
    expect(describeDestination(email(), ctx)).toBe("המסמך החתום המלא → שכר <payroll@x.org.il>");
    expect(describeDestination({ id: "d", kind: "drive", path: "שכר/{שנה}", items: [{ kind: "part", partId: "p1" }] }, ctx)).toBe("101 → שכר/{שנה}");
    expect(describeDestination({ id: "d", kind: "webhook", webhookId: "w1", items: [{ kind: "full" }] }, ctx)).toBe("המסמך החתום המלא → פריוריטי");
  });

  it("summarises the tab", () => {
    expect(describeProcessing({ parts: [], destinations: [] })).toBe("אין עיבוד");
    expect(describeProcessing({ parts: ctx.parts, destinations: [email()] })).toBe("חיתוך ל-1 חלקים · 1 יעדים");
  });
});

describe("destinationProblems", () => {
  it("passes a complete destination", () => {
    expect(destinationProblems(email(), ctx)).toEqual([]);
  });

  it("catches an empty destination", () => {
    expect(destinationProblems(email({ items: [], to: [] } as Partial<Destination>), ctx)).toEqual(["לא נבחר מה נשלח", "לא נבחרו נמענים"]);
  });

  it("catches references to things that were deleted", () => {
    expect(destinationProblems(email({ items: [{ kind: "part", partId: "gone" }] } as Partial<Destination>), ctx)).toContain("אחד החלקים שנבחרו כבר לא קיים");
    expect(destinationProblems(email({ to: [{ kind: "step", role: "approver6" }] } as Partial<Destination>), ctx)).toContain("אחד הנמענים מצביע על שלב שנמחק");
    expect(destinationProblems(email({ to: [{ kind: "user", userId: "gone" }] } as Partial<Destination>), ctx)).toContain("אחד הנמענים מצביע על משתמש שנמחק");
  });

  it("requires a folder or a path for Drive", () => {
    expect(destinationProblems({ id: "d", kind: "drive", items: [{ kind: "full" }] }, ctx)).toEqual(["לא נבחרה תיקייה ולא הוזן נתיב"]);
    expect(destinationProblems({ id: "d", kind: "drive", folderId: "f1", items: [{ kind: "full" }] }, ctx)).toEqual([]);
  });

  it("reports each problem once", () => {
    const d = email({ items: [{ kind: "part", partId: "a" }, { kind: "part", partId: "b" }] } as Partial<Destination>);
    expect(destinationProblems(d, ctx).filter((p) => p.includes("החלקים"))).toHaveLength(1);
  });

  it("says nothing about lists the editor did not supply", () => {
    expect(destinationProblems(email({ to: [{ kind: "user", userId: "u9" }] } as Partial<Destination>), { parts: [] })).toEqual([]);
  });
});

describe("the save path (normalizeProcessing with keepCompletion)", () => {
  it("reads the completion destination so it can be split out, but checks it like any other", () => {
    const posted = {
      parts: [],
      destinations: [
        { id: COMPLETION_DESTINATION_ID, kind: "email", attach: true, items: [{ kind: "full" }], to: [{ kind: "fixed", email: "ok@x.il" }, { kind: "fixed", email: "not-an-email" }, { kind: "junk" }] },
        { id: "d2", kind: "drive", path: "שכר/{שנה}", items: [{ kind: "full" }] },
      ],
    };
    const { processing, completionRecipients } = splitProcessing(normalizeProcessing(posted, true));
    expect(completionRecipients).toEqual([{ name: "ok@x.il", email: "ok@x.il" }]);
    expect(processing.destinations.map((d) => d.id)).toEqual(["d2"]);
  });

  it("without keepCompletion the completion destination is dropped, so it can never be stored twice", () => {
    expect(normalizeProcessing({ destinations: [{ id: COMPLETION_DESTINATION_ID, kind: "email", to: [], items: [] }] }).destinations).toEqual([]);
  });
});
