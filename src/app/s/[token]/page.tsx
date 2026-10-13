import { headers } from "next/headers";
import { OrgTheme } from "@/components/branding";
import { Card } from "@/components/ui/card";
import { answersForClient } from "@/lib/forms/client-answers";
import { loadByToken, markOpened, otpPassed } from "@/server/signing";
import { OtpGate } from "./otp-gate";
import { SigningClient } from "./signing-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "מילוי וחתימה", robots: { index: false } };

const GONE: Record<string, { title: string; text: string }> = {
  invalid: { title: "הקישור אינו תקין", text: "ייתכן שהועתק חלקית. בקשו קישור חדש ממי ששלח לכם אותו." },
  revoked: { title: "הקישור כבר אינו פעיל", text: "הקישור הוחלף או בוטל. אם עדיין נדרשת פעולה מצדכם, בקשו קישור חדש." },
  expired: { title: "תוקף הקישור פג", text: "בקשו קישור חדש ממי ששלח לכם אותו." },
  closed: { title: "אין כרגע פעולה הממתינה לכם", text: "השלב הזה כבר הושלם או שהבקשה נסגרה. תודה!" },
};

export default async function SigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadByToken(token);
  if (ctx.state !== "ok") {
    const g = GONE[ctx.state]!;
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="space-y-2 p-6 text-center">
          <h1 className="text-xl font-bold">{g.title}</h1>
          <p className="text-muted-foreground">{g.text}</p>
        </Card>
      </main>
    );
  }
  const h = await headers();
  if (!otpPassed(ctx, h.get("cookie"))) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <OrgTheme org={ctx.org}>
          <OtpGate token={token} />
        </OrgTheme>
      </main>
    );
  }
  await markOpened(ctx, { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim(), userAgent: h.get("user-agent") ?? undefined });
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <OrgTheme org={ctx.org}>
        <SigningClient
          token={token}
          definition={ctx.definition}
          initialAnswers={answersForClient(ctx.definition, ctx.answers)}
          filled={ctx.filled}
          role={ctx.role}
          subjectName={ctx.request.subjectName}
          action={ctx.step.action}
          returnTargets={ctx.returnTargets}
          pdfDocs={ctx.pdfDocs.map((d) => ({ title: d.title, url: `/api/s/${token}/pdf/${d.fileId}`, mapping: d.mapping }))}
        />
      </OrgTheme>
    </main>
  );
}
