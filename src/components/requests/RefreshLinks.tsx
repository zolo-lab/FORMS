"use client";
import { useState, useTransition } from "react";
import { refreshLinksAction } from "@/app/admin/requests/actions";
import { Button } from "@/components/ui/button";
import { ShareLinks, type ShareLinkView } from "./ShareLinks";

/** Issues fresh links on demand (the plain token is never stored). Warns that older links stop working. */
export function RefreshLinks({ requestId }: { requestId: string }) {
  const [links, setLinks] = useState<ShareLinkView[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {links ? (
        <ShareLinks links={links} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">הקישורים לא נשמרים במערכת. יצירת קישור חדש מבטלת את הקישור הקודם של אותו שלב, גם אם נשלח במייל.</p>
          <Button variant="outline" disabled={pending} onClick={() => start(async () => setLinks(await refreshLinksAction(requestId)))}>
            {pending ? "יוצר…" : "צור קישורים חדשים לשיתוף"}
          </Button>
        </>
      )}
    </div>
  );
}
