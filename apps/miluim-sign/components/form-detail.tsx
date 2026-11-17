"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner, Button, StatusProgress } from "@/components/ui";
import { remindMessage, signMessage, waLink } from "@/lib/phone";
import { formatWhen, type DocumentRow } from "@/lib/types";

export function FormDetail({ id }: { id: string }) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await fetch(`/api/documents/${id}`);
      const body = await res.json().catch(() => ({}));
      if (cancel) return;
      if (!res.ok) { setError(body.error || "הטופס לא נמצא"); return; }
      setDoc(body.document);
    })();
    return () => { cancel = true; };
  }, [id]);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  if (error && !doc) return <Banner tone="error">{error}</Banner>;
  if (!doc) return <p role="status">טוען…</p>;
  const link = `${origin}/s/${doc.token}`;
  const remind = waLink(doc.signerPhone, remindMessage(doc.signerName, link));
  const image = doc.signedImagePath ? `/api/file?url=${encodeURIComponent(doc.signedImagePath)}` : doc.pages[0] ? `/api/file?url=${encodeURIComponent(doc.pages[0].path)}` : null;

  const shareSigned = async () => {
    if (!doc.signedImagePath) return;
    const res = await fetch(`/api/file?url=${encodeURIComponent(doc.signedImagePath)}`);
    const blob = await res.blob();
    const file = new File([blob], "signed.jpg", { type: "image/jpeg" });
    const text = `כתב ההסכמה החתום${doc.signerName ? ` של ${doc.signerName}` : ""}`;
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title: "כתב הסכמה חתום" });
      return;
    }
    if (navigator.share) await navigator.share({ text, title: "כתב הסכמה חתום" });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{doc.signerName || "טופס"}</h1>
        {image ? <img src={image} alt="הטופס" className="w-full rounded-lg border border-border" /> : null}
      </div>
      <div className="space-y-3">
        <StatusProgress status={doc.status} />
        <p className="text-sm text-muted-foreground">נשלח {formatWhen(doc.sentAt)}{doc.openedAt ? ` · נפתח ${formatWhen(doc.openedAt)}` : ""}{doc.signedAt ? ` · נחתם ${formatWhen(doc.signedAt)}` : ""}</p>
        {doc.fileHash ? (
          <div className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
            <p>טביעת SHA-256 של ה-PDF החתום</p>
            <p dir="ltr" className="break-all font-mono text-xs">{doc.fileHash}</p>
            <p>IP: <span dir="ltr">{doc.signerIp}</span></p>
            <p className="break-all">דפדפן: {doc.signerUa}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {doc.status !== "signed" && remind ? <a className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-accent-foreground" href={remind} target="_blank" rel="noreferrer">תזכורת בוואטסאפ</a> : null}
          {doc.status !== "signed" ? <Button variant="quiet" onClick={() => navigator.clipboard.writeText(link)}>העתקת קישור</Button> : null}
          {doc.status !== "signed" ? <Button variant="quiet" onClick={() => navigator.share?.({ text: signMessage(doc.signerName, link), url: link })}>שיתוף</Button> : null}
          {doc.signedImagePath ? <a className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 font-medium" href={`/api/documents/${doc.id}/file?kind=image`}>הורדת תמונה</a> : null}
          {doc.signedPdfPath ? <a className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 font-medium" href={`/api/documents/${doc.id}/file?kind=pdf`}>הורדת PDF</a> : null}
          {doc.signedImagePath ? <Button variant="quiet" onClick={shareSigned}>שיתוף בוואטסאפ</Button> : null}
        </div>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">חזרה לרשימה</Link>
      </div>
    </div>
  );
}
