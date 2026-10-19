import { NextResponse } from "next/server";
import { deliverQueued } from "@/server/notifications";
import { runReminders } from "@/server/reminders";
import { expireOverdue } from "@/server/requests-store";
import { runWeeklyDigest } from "@/server/digest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Vercel Cron: expires overdue requests, queues reminders and sends queued notifications. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Expire first so nobody is reminded about a request that just ran out; deliver last so new reminders go out now.
  const expired = await expireOverdue();
  const reminders = await runReminders();
  const digests = await runWeeklyDigest().catch((e) => { console.error("[digest] failed", e); return 0; });
  const delivered = await deliverQueued(50);
  return NextResponse.json({ expired, reminders, digests, delivered });
}
