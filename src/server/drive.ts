/**
 * Google Drive archive for signed PDFs. A service account (GOOGLE_SERVICE_ACCOUNT_JSON) uploads into the
 * folder GOOGLE_DRIVE_ROOT_FOLDER_ID, which must be shared with it as editor. Plain REST + node crypto, no SDK.
 * Disabled (returns null) when either variable is missing, so dev, CI and unconfigured deploys are unaffected.
 */
import { createSign } from "node:crypto";
import { archiveLayoutFromEnv, archiveTarget, type ArchiveInput } from "@/lib/drive/archive-path";

const SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER = "application/vnd.google-apps.folder";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function readAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    return j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null;
  } catch {
    return null;
  }
}

export const driveEnabled = () => !!readAccount() && !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

/** Why the archive is off, for the admin screen. Names what is missing, never a value. */
export function driveProblem(): string | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return "המשתנה GOOGLE_SERVICE_ACCOUNT_JSON לא מוגדר";
  let j: Partial<ServiceAccount>;
  try {
    j = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    return "GOOGLE_SERVICE_ACCOUNT_JSON אינו JSON תקין (ייתכן שהודבק חלקית)";
  }
  if (!j.client_email) return "ב-JSON חסר client_email";
  if (!j.private_key) return "ב-JSON חסר private_key";
  if (!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) return "המשתנה GOOGLE_DRIVE_ROOT_FOLDER_ID לא מוגדר";
  return null;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

let cached: { token: string; exp: number } | null = null;

async function accessToken(acc: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: acc.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(acc.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(`drive auth failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: now + j.expires_in };
  return j.access_token;
}

async function api<T>(acc: ServiceAccount, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await accessToken(acc)}` } });
  if (!res.ok) throw new Error(`drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** The child folder with this name, created when missing. */
async function childFolder(acc: ServiceAccount, parentId: string, name: string): Promise<string> {
  const q = `'${esc(parentId)}' in parents and name = '${esc(name)}' and mimeType = '${FOLDER}' and trashed = false`;
  const found = await api<{ files: { id: string }[] }>(acc, `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1", supportsAllDrives: "true", includeItemsFromAllDrives: "true" })}`);
  if (found.files[0]) return found.files[0].id;
  const made = await api<{ id: string }>(acc, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
  return made.id;
}

export interface ArchivedFile {
  driveFileId: string;
  driveUrl: string;
}

/** Files the PDF under organization / form type / year. Returns null when the archive is not configured. */
export async function archivePdf(input: ArchiveInput & { bytes: Uint8Array }): Promise<ArchivedFile | null> {
  const acc = readAccount();
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!acc || !root) return null;
  const target = archiveTarget(input, archiveLayoutFromEnv(process.env.GOOGLE_DRIVE_LAYOUT));
  let parent = root;
  for (const name of target.folders) parent = await childFolder(acc, parent, name);

  const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: target.fileName, parents: [parent], mimeType: "application/pdf" });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/pdf\r\n\r\n`),
    Buffer.from(input.bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const file = await api<{ id: string; webViewLink?: string }>(acc, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return { driveFileId: file.id, driveUrl: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view` };
}
