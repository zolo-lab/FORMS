/**
 * Database schema (Drizzle): organizations, users, form-builder tables (phase 1-2),
 * packages / requests / signing steps / events / notifications (phase 3).
 * Extend this file, don't fork it.
 *
 * Migrations: never hand-edit drizzle/*.sql. See docs/HANDOFF.md → "Database".
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { FormDefinition } from "@/lib/forms/schema";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import type { Condition } from "@/lib/forms/schema";
import type { ReminderPolicy, Workflow } from "@/lib/workflow/types";
import type { ExportTemplate } from "@/lib/export/template";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const userRole = pgEnum("user_role", ["admin", "payroll", "approver", "org_office"]);
export const templateStatus = pgEnum("template_status", ["draft", "active", "archived"]);
export const templateKind = pgEnum("template_kind", ["web", "pdf", "both"]);
export const requestStatus = pgEnum("request_status", [
  "draft", "in_progress", "returned", "completed", "declined", "cancelled", "expired",
]);
export const stepStatus = pgEnum("step_status", [
  "pending", "active", "in_progress", "completed", "declined", "returned", "skipped", "expired", "cancelled", "delegated",
]);
export const stepAction = pgEnum("step_action", ["fill", "sign", "approve", "fill_and_sign", "view"]);
export const channel = pgEnum("channel", ["email", "sms", "whatsapp", "link"]);
export const notificationStatus = pgEnum("notification_status", ["queued", "sent", "failed"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** מספר עמותה, e.g. 580556306 */
  registrationNumber: text("registration_number").notNull().unique(),
  active: boolean("active").notNull().default(true),
  /** Short URL-safe key, e.g. "shivat-zion" (used in /preview/sample?org=...). */
  slug: text("slug").unique(),
  logoFileId: uuid("logo_file_id"),
  /** CSS color for --primary on the signing screen, e.g. "#1d4ed8". */
  primaryColor: text("primary_color"),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  smsSenderId: text("sms_sender_id"),
  dateFormat: text("date_format").notNull().default("dd/MM/yyyy"),
  stampImageFileId: uuid("stamp_image_file_id"),
  reminderPolicy: jsonb("reminder_policy").$type<ReminderPolicy>(),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull(),
  /** null = all organizations (admin/payroll). */
  organizationId: uuid("organization_id").references(() => organizations.id),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/**
 * People who can be the next signer of a step: staff (secretariats, managers, payroll) and outside contacts
 * (suppliers, advisers). A contact never logs in; a `users` row is for login, a contact is for routing.
 */
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** null = shared by all organizations */
  organizationId: uuid("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  /** "internal" = staff of one of the associations, "external" = supplier/adviser. */
  kind: text("kind").$type<"internal" | "external">().notNull().default("internal"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** A team or group of contacts (e.g. "מזכירות ארצנו", "ספקי לינה"): a step can go to one of them or to all of them. */
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  ...timestamps,
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.contactId] })],
);

/**
 * File metadata for PDFs and uploads. Bytes live in a private Vercel Blob object `files/<id>` (data_base64 = "");
 * rows written before Blob was connected keep inline base64. All access goes through src/server/storage.ts.
 */
export const storedFiles = pgTable("stored_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  dataBase64: text("data_base64").notNull(),
  ...timestamps,
});

/** Uploaded PDF files used as stamping backgrounds. Bytes live in Vercel Blob. */
export const pdfFiles = pgTable("pdf_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  blobUrl: text("blob_url").notNull(),
  sha256: text("sha256").notNull(),
  pageCount: integer("page_count").notNull(),
  /** [{width,height}] in PDF points */
  pages: jsonb("pages").$type<{ width: number; height: number }[]>().notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  ...timestamps,
});

/** A form (e.g. "טופס 101"). Its content lives in versions. */
export const formTemplates = pgTable("form_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stable key used in code/Make, e.g. "form-101". */
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  /** null = shared by all organizations */
  organizationId: uuid("organization_id").references(() => organizations.id),
  status: templateStatus("status").notNull().default("draft"),
  /** web = online form, pdf = fields placed on a PDF, both = web form that also fills a PDF. */
  kind: templateKind("kind").notNull().default("web"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** Version that new submissions use. Set on publish. */
  publishedVersion: integer("published_version"),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

/**
 * Immutable once published (published_at not null). Editing a published form
 * creates a new draft version; submissions keep pointing at the version they used.
 */
export const formTemplateVersions = pgTable(
  "form_template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => formTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition").$type<FormDefinition>().notNull(),
    pdfFileId: uuid("pdf_file_id").references(() => pdfFiles.id),
    pdfMapping: jsonb("pdf_mapping").$type<PdfMapping>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("form_template_versions_template_version_uq").on(t.templateId, t.version),
    index("form_template_versions_published_idx").on(t.templateId).where(sql`${t.publishedAt} is not null`),
  ],
);

// ───────────────────────── Phase 3: packages, requests, signing ─────────────────────────

/** A package = list of form templates + the signing workflow. A request is one run of it. */
export const packageTemplates = pgTable("package_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** null = available to all organizations */
  organizationId: uuid("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  workflow: jsonb("workflow").$type<Workflow>().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const packageTemplateItems = pgTable(
  "package_template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packageTemplateId: uuid("package_template_id")
      .notNull()
      .references(() => packageTemplates.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => formTemplates.id),
    order: integer("order").notNull(),
    required: boolean("required").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("package_template_items_pkg_template_uq").on(t.packageTemplateId, t.templateId)],
);

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    packageTemplateId: uuid("package_template_id")
      .notNull()
      .references(() => packageTemplates.id),
    /** 'onboarding' | 'termination' | 'custom' */
    kind: text("kind").notNull().default("onboarding"),
    subjectName: text("subject_name").notNull(),
    subjectIdNumber: text("subject_id_number"),
    subjectEmail: text("subject_email"),
    subjectPhone: text("subject_phone"),
    createdBy: uuid("created_by").references(() => users.id),
    status: requestStatus("status").notNull().default("draft"),
    /** `order` of the step(s) currently waiting for action. */
    currentOrder: integer("current_order").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    externalRef: text("external_ref"),
    apiParams: jsonb("api_params").$type<Record<string, unknown>>(),
    redirectUrl: text("redirect_url"),
    ...timestamps,
  },
  (t) => [
    index("requests_org_status_idx").on(t.organizationId, t.status),
    index("requests_due_idx").on(t.dueAt),
  ],
);

/** One form of the package inside a request, pinned to the template version used. */
export const packageDocuments = pgTable("package_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  templateVersionId: uuid("template_version_id")
    .notNull()
    .references(() => formTemplateVersions.id),
  order: integer("order").notNull(),
  /** 'pending' | 'completed' */
  status: text("status").notNull().default("pending"),
  finalFileId: uuid("final_file_id"),
  finalSha256: text("final_sha256"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  ...timestamps,
});

export const signingSteps = pgTable(
  "signing_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    /** Same as `order` for now; kept separate so a future "branch" can group differently. */
    parallelGroup: integer("parallel_group").notNull().default(0),
    role: text("role").notNull(),
    action: stepAction("action").notNull().default("fill"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    assigneeName: text("assignee_name"),
    assigneeEmail: text("assignee_email"),
    assigneePhone: text("assignee_phone"),
    assigneeFromFieldId: text("assignee_from_field_id"),
    skipIf: jsonb("skip_if").$type<Condition>(),
    status: stepStatus("status").notNull().default("pending"),
    channel: channel("channel").notNull().default("email"),
    otpRequired: boolean("otp_required").notNull().default(false),
    otpHash: text("otp_hash"),
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    delegatedFromStepId: uuid("delegated_from_step_id"),
    returnedToStepId: uuid("returned_to_step_id"),
    declineReason: text("decline_reason"),
    returnReason: text("return_reason"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),
    ...timestamps,
  },
  (t) => [index("signing_steps_request_idx").on(t.requestId, t.order)],
);

/** Personal one-time link per step. Only the sha256 of the token is stored. */
export const stepTokens = pgTable("step_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  stepId: uuid("step_id")
    .notNull()
    .references(() => signingSteps.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  ...timestamps,
});

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => signingSteps.id, { onDelete: "cascade" }),
    /** 'draft' | 'submitted' */
    status: text("status").notNull().default("draft"),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("submissions_step_uq").on(t.stepId)],
);

export const signatures = pgTable("signatures", {
  id: uuid("id").primaryKey().defaultRandom(),
  stepId: uuid("step_id")
    .notNull()
    .references(() => signingSteps.id, { onDelete: "cascade" }),
  fieldId: text("field_id").notNull(),
  /** 'drawn' | 'typed' | 'initials' | 'stamp' */
  kind: text("kind").notNull(),
  fileId: uuid("file_id"),
  typedText: text("typed_text"),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

/** Append-only audit log. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    stepId: uuid("step_id"),
    /** 'user' | 'signer' | 'system' | 'api' */
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("events_request_created_idx").on(t.requestId, t.createdAt)],
);

/** Outbox: rows are created in a transaction with the state change, sent by a worker. */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  requestId: uuid("request_id").references(() => requests.id, { onDelete: "cascade" }),
  stepId: uuid("step_id"),
  channel: channel("channel").notNull(),
  to: text("to").notNull(),
  templateKey: text("template_key").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: notificationStatus("status").notNull().default("queued"),
  providerId: text("provider_id"),
  error: text("error"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  ...timestamps,
});

export const reminderSchedules = pgTable(
  "reminder_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stepId: uuid("step_id")
      .notNull()
      .references(() => signingSteps.id, { onDelete: "cascade" }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    intervalHours: integer("interval_hours").notNull(),
    maxCount: integer("max_count").notNull(),
    sentCount: integer("sent_count").notNull().default(0),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("reminder_schedules_next_idx").on(t.nextRunAt).where(sql`${t.stoppedAt} is null`)],
);

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = default for all organizations */
    organizationId: uuid("organization_id").references(() => organizations.id),
    key: text("key").notNull(),
    channel: channel("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("message_templates_org_key_channel_uq").on(t.organizationId, t.key, t.channel)],
);

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  templateId: uuid("template_id").references(() => formTemplates.id),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull().default(sql`'{}'::text[]`),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps,
});

export const bulkJobs = pgTable("bulk_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  packageTemplateId: uuid("package_template_id")
    .notNull()
    .references(() => packageTemplates.id),
  fileId: uuid("file_id"),
  rowCount: integer("row_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  errors: jsonb("errors").$type<{ row: number; message: string }[]>().notNull().default([]),
  status: text("status").notNull().default("pending"),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

/**
 * Export templates ("תבנית העלאה לפריוריטי" and the like): the header row of a file another system imports,
 * with each column mapped to a field, a request value or a constant. See src/lib/export/template.ts.
 */
export const exportTemplates = pgTable("export_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** The package whose forms the columns map to; null = mapping by field ids across any package. */
  packageTemplateId: uuid("package_template_id").references(() => packageTemplates.id, { onDelete: "set null" }),
  template: jsonb("template").$type<ExportTemplate>().notNull(),
  ...timestamps,
});
