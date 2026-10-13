import { NextResponse } from "next/server";
import { deliverQueued } from "@/server/notifications";
import { expireOverdue } from "@/server/requests-store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Vercel Cron: sends queued notifications and expires overdue requests. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const delivered = await deliverQueued(50);
  const expired = await expireOverdue();
  return NextResponse.json({ delivered, expired });
}
