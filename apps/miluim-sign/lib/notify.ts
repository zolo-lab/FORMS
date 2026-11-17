import webpush from "web-push";
import { deletePush, listPush } from "./db";

export async function notifySigned(signerName: string, docId: string): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const subs = await listPush();
  const payload = JSON.stringify({
    title: "נחתם כתב הסכמה",
    body: signerName ? `${signerName} חתם/ה על הטופס` : "חייל חתם על הטופס",
    url: `/forms/${docId}`,
  });
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (error) {
      const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) await deletePush(sub.endpoint);
    }
  }));
}
