import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { DocStatus, DocumentRow, Field, PageRef, TemplateRow } from "./types";

type Sql = NeonQueryFunction<false, false>;

let ready: Promise<void> | null = null;

function client(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  return neon(url);
}

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = migrate().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function migrate(): Promise<void> {
  const sql = client();
  await sql`create table if not exists miluim_templates (
    id text primary key,
    name text not null,
    pages jsonb not null,
    fields jsonb not null,
    thumb_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`create table if not exists miluim_documents (
    id text primary key,
    template_id text,
    title text not null,
    pages jsonb not null,
    fields jsonb not null,
    signer_name text not null default '',
    signer_phone text not null default '',
    one_signature boolean not null default true,
    token text not null unique,
    status text not null,
    prefill jsonb not null default '{}'::jsonb,
    answers jsonb,
    sent_at timestamptz,
    opened_at timestamptz,
    signed_at timestamptz,
    signer_ip text,
    signer_ua text,
    file_hash text,
    signed_pdf_path text,
    signed_image_path text,
    seen boolean not null default false,
    created_at timestamptz not null default now()
  )`;
  await sql`create index if not exists miluim_documents_created on miluim_documents (created_at desc)`;
  await sql`create table if not exists miluim_login_attempts (
    ip text primary key,
    failures int not null default 0,
    locked_until timestamptz
  )`;
  await sql`create table if not exists miluim_push_subs (
    id text primary key,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    created_at timestamptz not null default now()
  )`;
}

function asPages(value: unknown): PageRef[] {
  return Array.isArray(value) ? value as PageRef[] : [];
}
function asFields(value: unknown): Field[] {
  return Array.isArray(value) ? value as Field[] : [];
}

function templateFrom(row: Record<string, unknown>): TemplateRow {
  return {
    id: String(row.id),
    name: String(row.name),
    pages: asPages(row.pages),
    fields: asFields(row.fields),
    thumbPath: row.thumb_path ? String(row.thumb_path) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    version: String(row.version ?? row.updated_at),
  };
}

function docFrom(row: Record<string, unknown>): DocumentRow {
  const prefill = (row.prefill && typeof row.prefill === "object") ? row.prefill as DocumentRow["prefill"] : {};
  const answers = row.answers && typeof row.answers === "object" ? row.answers as Record<string, string> : null;
  return {
    id: String(row.id),
    templateId: row.template_id ? String(row.template_id) : null,
    title: String(row.title),
    pages: asPages(row.pages),
    fields: asFields(row.fields),
    signerName: String(row.signer_name ?? ""),
    signerPhone: String(row.signer_phone ?? ""),
    oneSignature: Boolean(row.one_signature),
    token: String(row.token),
    status: String(row.status) as DocStatus,
    prefill,
    answers,
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
    openedAt: row.opened_at ? new Date(String(row.opened_at)).toISOString() : null,
    signedAt: row.signed_at ? new Date(String(row.signed_at)).toISOString() : null,
    signerIp: row.signer_ip ? String(row.signer_ip) : null,
    signerUa: row.signer_ua ? String(row.signer_ua) : null,
    fileHash: row.file_hash ? String(row.file_hash) : null,
    signedPdfPath: row.signed_pdf_path ? String(row.signed_pdf_path) : null,
    signedImagePath: row.signed_image_path ? String(row.signed_image_path) : null,
    seen: Boolean(row.seen),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function listTemplates(): Promise<TemplateRow[]> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`select *, updated_at::text as version from miluim_templates order by updated_at desc`;
  return rows.map((row) => templateFrom(row));
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`select *, updated_at::text as version from miluim_templates where id = ${id}`;
  return rows[0] ? templateFrom(rows[0]) : null;
}

export async function insertTemplate(input: { id: string; name: string; pages: PageRef[]; fields: Field[]; thumbPath: string | null }): Promise<void> {
  await ensureSchema();
  const sql = client();
  await sql`insert into miluim_templates (id, name, pages, fields, thumb_path)
    values (${input.id}, ${input.name}, ${JSON.stringify(input.pages)}::jsonb, ${JSON.stringify(input.fields)}::jsonb, ${input.thumbPath})`;
}

/**
 * One update of only the columns that were sent, and only if `expectedUpdatedAt` still matches.
 * A concurrent edit changes `updated_at`, so this write does not land on a stale template.
 * Returns the exact `updated_at` text written, or null when the stored version no longer matches.
 */
export async function updateTemplate(id: string, expectedUpdatedAt: string, patch: { name?: string; fields?: Field[]; pages?: PageRef[]; thumbPath?: string | null }): Promise<string | null> {
  await ensureSchema();
  const sql = client();
  const nameOn = patch.name !== undefined;
  const fieldsOn = patch.fields !== undefined;
  const pagesOn = patch.pages !== undefined;
  const thumbOn = patch.thumbPath !== undefined;
  if (!nameOn && !fieldsOn && !pagesOn && !thumbOn) return expectedUpdatedAt;
  const rows = await sql`update miluim_templates set
      name = case when ${nameOn} then ${patch.name ?? ""} else name end,
      fields = case when ${fieldsOn} then ${JSON.stringify(patch.fields ?? [])}::jsonb else fields end,
      pages = case when ${pagesOn} then ${JSON.stringify(patch.pages ?? [])}::jsonb else pages end,
      thumb_path = case when ${thumbOn} then ${patch.thumbPath ?? null} else thumb_path end,
      updated_at = now()
    where id = ${id} and updated_at::text = ${expectedUpdatedAt}
    returning updated_at::text as version`;
  const written = rows[0]?.version;
  return typeof written === "string" && written ? written : null;
}

export async function deleteTemplate(id: string): Promise<void> {
  await ensureSchema();
  const sql = client();
  await sql`delete from miluim_templates where id = ${id}`;
}

export async function insertDocuments(rows: {
  id: string;
  templateId: string | null;
  title: string;
  pages: PageRef[];
  fields: Field[];
  signerName: string;
  signerPhone: string;
  oneSignature: boolean;
  token: string;
  prefill: DocumentRow["prefill"];
}[]): Promise<void> {
  await ensureSchema();
  const sql = client();
  if (!rows.length) return;
  await sql.transaction(rows.map((row) => sql`insert into miluim_documents
    (id, template_id, title, pages, fields, signer_name, signer_phone, one_signature, token, status, prefill, sent_at)
    values (${row.id}, ${row.templateId}, ${row.title}, ${JSON.stringify(row.pages)}::jsonb, ${JSON.stringify(row.fields)}::jsonb,
      ${row.signerName}, ${row.signerPhone}, ${row.oneSignature}, ${row.token}, 'sent', ${JSON.stringify(row.prefill)}::jsonb, now())`));
}

export async function listDocuments(): Promise<DocumentRow[]> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`select * from miluim_documents order by created_at desc limit 300`;
  return rows.map((row) => docFrom(row));
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`select * from miluim_documents where id = ${id}`;
  return rows[0] ? docFrom(rows[0]) : null;
}

export async function markSeen(id: string): Promise<void> {
  await ensureSchema();
  const sql = client();
  await sql`update miluim_documents set seen = true where id = ${id}`;
}

export async function deleteDocument(id: string): Promise<DocumentRow | null> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`delete from miluim_documents where id = ${id} returning *`;
  return rows[0] ? docFrom(rows[0]) : null;
}

export async function getByToken(token: string): Promise<DocumentRow | null> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`select * from miluim_documents where token = ${token}`;
  return rows[0] ? docFrom(rows[0]) : null;
}

export async function markOpened(token: string): Promise<void> {
  await ensureSchema();
  const sql = client();
  await sql`update miluim_documents set status = 'opened', opened_at = coalesce(opened_at, now()) where token = ${token} and status = 'sent'`;
}

export async function markSigned(token: string, input: {
  answers: Record<string, string>;
  ip: string;
  ua: string;
  hash: string;
  pdfPath: string;
  imagePath: string;
}): Promise<boolean> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`update miluim_documents set
    status = 'signed',
    signed_at = now(),
    answers = ${JSON.stringify(input.answers)}::jsonb,
    signer_ip = ${input.ip},
    signer_ua = ${input.ua},
    file_hash = ${input.hash},
    signed_pdf_path = ${input.pdfPath},
    signed_image_path = ${input.imagePath},
    seen = false
    where token = ${token} and status <> 'signed'
    returning id`;
  return rows.length > 0;
}

export async function savePush(sub: { id: string; endpoint: string; p256dh: string; auth: string }): Promise<void> {
  await ensureSchema();
  const sql = client();
  await sql`insert into miluim_push_subs (id, endpoint, p256dh, auth)
    values (${sub.id}, ${sub.endpoint}, ${sub.p256dh}, ${sub.auth})
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth`;
}

export async function listPush(): Promise<{ id: string; endpoint: string; p256dh: string; auth: string }[]> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`select id, endpoint, p256dh, auth from miluim_push_subs`;
  return rows.map((row) => ({ id: String(row.id), endpoint: String(row.endpoint), p256dh: String(row.p256dh), auth: String(row.auth) }));
}

export async function deletePush(endpoint: string): Promise<void> {
  await ensureSchema();
  const sql = client();
  await sql`delete from miluim_push_subs where endpoint = ${endpoint}`;
}

/** Counts this try before the passcode is checked. Parallel guesses cannot share one counter. */
export async function claimLoginAttempt(ip: string): Promise<"locked" | "ok"> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`insert into miluim_login_attempts (ip, failures) values (${ip}, 1)
    on conflict (ip) do update set
      failures = case
        when miluim_login_attempts.locked_until > now() then miluim_login_attempts.failures
        else miluim_login_attempts.failures + 1
      end
    returning failures, locked_until`;
  const failures = Number(rows[0]?.failures ?? 1);
  const until = rows[0]?.locked_until;
  if (until && new Date(String(until)).getTime() > Date.now()) return "locked";
  if (failures >= 8) {
    await sql`update miluim_login_attempts set failures = 0, locked_until = now() + interval '15 minutes' where ip = ${ip}`;
    return "locked";
  }
  return "ok";
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await ensureSchema();
  const sql = client();
  await sql`delete from miluim_login_attempts where ip = ${ip}`;
}
