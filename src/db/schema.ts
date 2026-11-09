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
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { FormDefinition } from "@/lib/forms/schema";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";
import type { Condition } from "@/lib/forms/schema";
import type { ReminderPolicy, Workflow } from "@/lib/workflow/types";
import type { ExportTemplate } from "@/lib/export/template";
import type { UserGrants } from "@/lib/auth/permissions";
import type { ExpiryRule } from "@/lib/requests/expiry";
import type { FollowUpStatus } from "@/lib/requests/follow-up";
import type { RecipientKind } from "@/lib/notifications/triggers";
import type { Processing } from "@/lib/processing/types";
import type { SummarySchedule } from "@/lib/notifications/open-summary";
import type { UserNotificationPrefs } from "@/lib/notifications/user-prefs";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** `manager` is the ordinary user. payroll / approver / org_office are legacy values, read as `manager` (see normalizeRole). */
export const userRole = pgEnum("user_role", ["admin", "payroll", "approver", "org_office", "manager"]);
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
  /**
   * Dead since 5.11.2026, when Drive filing left "עיבוד טופס": nothing reads or writes it, and no
   * organization ever held a value. Still declared on purpose — migrations run before the new build, so
   * dropping it in the same deploy breaks the live deployment's organization reads (signing included)
   * until the new one is promoted. Drop it in a deploy of its own.
   */
  driveRootFolderId: text("drive_root_folder_id"),
  /** מספר עמותה, e.g. 580556306 */
  registrationNumber: text("registration_number").notNull().unique(),
  /** Legacy single project name (6.17); moved into `projects` on first read and not used otherwise. */
  projectName: text("project_name"),
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
  /** Weekly "waiting" summary to the organization's tracking users and admins. */
  weeklyDigest: boolean("weekly_digest").notNull().default(true),
  /** Secretariat and bookkeeping addresses: recipients the e-mail triggers can choose (see triggers.ts). */
  secretariatEmails: jsonb("secretariat_emails").$type<string[]>().notNull().default([]),
  bookkeepingEmails: jsonb("bookkeeping_emails").$type<string[]>().notNull().default([]),
  /** This organization's value for each field of `organizationFieldDefs`, by key. A key with no value is blank. */
  fieldValues: jsonb("field_values").$type<Record<string, string>>().notNull().default({}),
  ...timestamps,
});

/**
 * The organizations' own identifying fields ("מספר תיק ניכויים", "מספר חוזה"…): one definition for the whole
 * system, so a form can carry the field whichever organization starts the route, and every organization fills in
 * its own value (`organizations.fieldValues`). A form field pre-filled from `org.fields.<key>` shows it read-only.
 */
export const organizationFieldDefs = pgTable("organization_field_defs", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stable key used in the forms (`org.fields.<key>`); never changes once forms point at it. */
  key: text("key").notNull().unique(),
  /** The name people see (Hebrew); `key` is the internal name made from it. */
  label: text("label").notNull(),
  /** The field type a form field gets when it is added from this definition (single-line types only). */
  type: text("type").notNull().default("short_text"),
  /** For a choice field (`type` "select"): the options an organization picks one of. */
  options: jsonb("options").$type<string[]>().notNull().default([]),
  order: integer("order").notNull().default(0),
  ...timestamps,
});

/**
 * A kind of list ("ספק", "עיר", "סניף"): a named set of fields. Every list of the type has a value in each field;
 * adding a field adds it to all of them. The organizations are a built-in type that lives in `organizations` and is
 * not stored here.
 */
export const listTypes = pgTable("list_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  ...timestamps,
});

/**
 * One field of a list type. `key` is the hidden internal name the forms point at; people see `label`.
 * `kind` is a single-line type, yes/no, a choice from `options` (one or several), or "belongs to" another type.
 */
export const listTypeFields = pgTable(
  "list_type_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listTypeId: uuid("list_type_id")
      .notNull()
      .references(() => listTypes.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    kind: text("kind").notNull().default("short_text"),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    multi: boolean("multi").notNull().default(false),
    /** For "belongs to": the type whose lists this field points at (a store's city). */
    parentTypeId: uuid("parent_type_id").references(() => listTypes.id, { onDelete: "set null" }),
    order: integer("order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("list_type_fields_key_idx").on(t.listTypeId, t.key)],
);

/**
 * One list of a type: one supplier, one city. `values` holds its value per field key – a string, or several for a
 * multiple choice; "belongs to" stores the id of the list it points at.
 */
export const listRecords = pgTable(
  "list_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listTypeId: uuid("list_type_id")
      .notNull()
      .references(() => listTypes.id, { onDelete: "cascade" }),
    values: jsonb("values").$type<Record<string, string | string[]>>().notNull().default({}),
    order: integer("order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("list_records_type_idx").on(t.listTypeId)],
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Real address, or `<login>@users.invalid` for a user created without e-mail (never mailed, see `isMailable`). */
  email: text("email").notNull().unique(),
  /** Sign-in name for password users (e.g. "mazkirut-tt"); null = sign in with the e-mail. */
  login: text("login").unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull(),
  /** scrypt hash for demo/test users who sign in with a password (Google users have none). */
  passwordHash: text("password_hash"),
  /** Unused since `user_organizations`: the organizations a manager may work with live there. */
  organizationId: uuid("organization_id").references(() => organizations.id),
  /** Extra permissions given to a manager (see `UserGrants` in permissions.ts); admins have all of them. */
  grants: jsonb("grants").$type<Partial<UserGrants>>().notNull().default({}),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** A project inside a nonprofit / business: its own name, under the organization's name and registration number. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Short name in the form's link of the project: /f/<form>/<organization>/<project>. */
    slug: text("slug"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("projects_org_name_idx").on(t.organizationId, t.name)],
);

/** Limits a manager to some organizations. A user with no rows here may work with all of them. */
export const userOrganizations = pgTable(
  "user_organizations",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.organizationId] })],
);

/** Limits a manager to single projects (an organization reached only through projects is limited to those). */
export const userProjects = pgTable(
  "user_projects",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);

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
  /** The organizations the form is open to (its link per organization: /f/<form>/<slug>); empty = organizationId / all. */
  organizationIds: jsonb("organization_ids").$type<string[]>().notNull().default([]),
  /** A route of its own per organization (its steps and people); an organization without one follows `workflow`. */
  orgWorkflows: jsonb("org_workflows").$type<Record<string, Workflow>>().notNull().default({}),
  name: text("name").notNull(),
  description: text("description"),
  workflow: jsonb("workflow").$type<Workflow>().notNull(),
  /** When the links of a request expire (see src/lib/requests/expiry.ts); null = the default 30 days. */
  expiryRule: jsonb("expiry_rule").$type<ExpiryRule>(),
  /** Fixed people who get the completion e-mail with the signed PDFs attached. */
  completionRecipients: jsonb("completion_recipients").$type<{ name: string; email: string }[]>().notNull().default([]),
  /** "עיבוד טופס": cutting the signed documents and where each piece goes (src/lib/processing/types.ts).
   * The completion e-mail recipients are NOT here — they stay in `completionRecipients`, which both screens edit. */
  processing: jsonb("processing").$type<Processing>(),
  /** Handling steps after signing, ticked by staff (e.g. "עודכן בשכר"). */
  followUpStatuses: jsonb("follow_up_statuses").$type<FollowUpStatus[]>().notNull().default([]),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  /** Free text the mail triggers can include as {{note}}, e.g. "לא ניתן להתחיל עבודה בפועל ללא חתימה". */
  mailNote: text("mail_note"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

/**
 * Who may do what with one package (form type). Admins need no rows. A user without a row for a package
 * cannot open requests of it and sees only requests they created or are a step in.
 */
export const packagePermissions = pgTable(
  "package_permissions",
  {
    packageTemplateId: uuid("package_template_id").notNull().references(() => packageTemplates.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** May start a new request of this package. */
    canOpen: boolean("can_open").notNull().default(true),
    /** Sees every request of this package on the dashboard, not only their own. */
    canViewAll: boolean("can_view_all").notNull().default(false),
    /** May change the approval chain of a request they open (6.15b). */
    canEditChain: boolean("can_edit_chain").notNull().default(false),
    /** May edit the form templates of this package in the builder (without the "build forms" grant). */
    canEdit: boolean("can_edit").notNull().default(false),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.packageTemplateId, t.userId] })],
);

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

/** A person requests are about (employee, supplier…), one row per ID number across organizations. */
export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  idNumber: text("id_number").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  ...timestamps,
});

export const employeeOrganizations = pgTable(
  "employee_organizations",
  {
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.organizationId] })],
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
    /** Optional project of the organization the request belongs to. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** 'onboarding' | 'termination' | 'custom' */
    kind: text("kind").notNull().default("onboarding"),
    subjectName: text("subject_name").notNull(),
    subjectIdNumber: text("subject_id_number"),
    subjectEmail: text("subject_email"),
    subjectPhone: text("subject_phone"),
    /** The employee record of the person the request is about (matched by ID number when created). */
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    /**
     * Denormalised from the answers so the requests table and the messages need no submission join:
     * the value of the form's "שדה מזהה" and every field marked to show in the messages.
     */
    identifierLabel: text("identifier_label"),
    identifierValue: text("identifier_value"),
    messageDetails: jsonb("message_details").$type<{ label: string; value: string }[]>().notNull().default([]),
    /** Handling steps done after signing: key → when and by whom. */
    followUp: jsonb("follow_up").$type<Record<string, { at: string; byUserId?: string; byName?: string }>>().notNull().default({}),
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
    /** Campaign tag for mass sends (e.g. "101 2027"): groups requests on the campaigns screen. */
    campaign: text("campaign"),
    apiParams: jsonb("api_params").$type<Record<string, unknown>>(),
    redirectUrl: text("redirect_url"),
    ...timestamps,
  },
  (t) => [
    index("requests_org_status_idx").on(t.organizationId, t.status),
    index("requests_due_idx").on(t.dueAt),
    index("requests_campaign_idx").on(t.campaign),
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
  /** Copy filed in the Drive archive (null until archived, or when the archive is not configured). */
  driveFileId: text("drive_file_id"),
  driveUrl: text("drive_url"),
  ...timestamps,
});

/**
 * One attempt to send one thing to one destination of "עיבוד טופס" — the record behind "נשלח ✓" / "נסה שוב"
 * on the request page. A row per destination per round, so a request that came back and finished again
 * sends afresh instead of being skipped as already done.
 */
export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  /** The destination's id inside `package_templates.processing`. */
  destinationId: text("destination_id").notNull(),
  /** 'drive' | 'email' | 'webhook' */
  kind: text("kind").notNull(),
  /** Where it went, in words, for the request page ("חשבות שכר <payroll@…>"). */
  target: text("target").notNull(),
  /** The package_documents rows that were sent (whole documents and parts). */
  documentIds: jsonb("document_ids").$type<string[]>().notNull().default([]),
  /** 'queued' | 'done' | 'failed' */
  status: text("status").notNull().default("queued"),
  /** Where it landed, when the destination has a link (Drive). */
  url: text("url"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  /** How many times this request had completed when the row was made; a later round sends again. */
  round: integer("round").notNull().default(1),
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
    /** "One of the group" (group_any): the first member of this order to finish closes the others' steps. */
    anyOf: boolean("any_of").notNull().default(false),
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
    /** The step's own link deadline (from its route's `expiry`), set when it starts; used only when `ownLinkExpiry`. */
    linkExpiresAt: timestamp("link_expires_at", { withTimezone: true }),
    /** The step has its own expiry rule: `linkExpiresAt` (null = never) replaces the request's `expiresAt` for it. */
    ownLinkExpiry: boolean("own_link_expiry").notNull().default(false),
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
  /** The designed e-mail (HTML) when the trigger has one; `body` is its plain-text part. */
  html: text("html"),
  error: text("error"),
  /**
   * Stored files to attach when this one is sent ("עיבוד טופס" mails a chosen part to a chosen person).
   * Empty/absent = the older behaviour, where the attachments follow from `templateKey`.
   */
  attachFileIds: jsonb("attach_file_ids").$type<string[]>(),
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

/** E-mail trigger settings (src/lib/notifications/triggers.ts). organizationId null = all organizations; an organization's row wins. */
export const mailTriggers = pgTable(
  "mail_triggers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    recipients: jsonb("recipients").$type<RecipientKind[]>().notNull().default([]),
    fixedRecipients: jsonb("fixed_recipients").$type<{ name: string; email: string }[]>().notNull().default([]),
    /** When a periodic trigger runs (open requests summary); null = its default. */
    schedule: jsonb("schedule").$type<SummarySchedule>(),
    updatedBy: uuid("updated_by"),
    ...timestamps,
  },
  (t) => [unique("mail_triggers_org_key_uq").on(t.organizationId, t.key).nullsNotDistinct()],
);

/**
 * What one signed-in user chose for themselves: which messages reach them, on which channel, and the reminder
 * timing they prefer. Beats the form's and the organization's settings (`src/lib/notifications/user-prefs.ts`).
 */
export const userNotificationPrefs = pgTable("user_notification_prefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Per group (my_turn, reminder, progress, finished, summaries): switch and channels. */
  groups: jsonb("groups").$type<UserNotificationPrefs["groups"]>().notNull().default({}),
  /** Only the parts of the reminder policy this person set; the rest stays the organization's. */
  reminderTiming: jsonb("reminder_timing").$type<UserNotificationPrefs["reminderTiming"]>().notNull().default({}),
  ...timestamps,
});

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

/**
 * What admins did with the fields the system proposed from a PDF (kept or dropped, the name, type and id they chose).
 * The next detection applies the latest decision for the same label, and the model is shown recent ones as examples.
 * See src/lib/pdf/learn.ts.
 */
export const detectFeedback = pgTable(
  "detect_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The label as the local detection read it, and its normalized form (the lookup key). */
    sourceLabel: text("source_label").notNull(),
    sourceNorm: text("source_norm").notNull(),
    detectedType: text("detected_type").notNull(),
    kept: boolean("kept").notNull(),
    finalLabel: text("final_label"),
    finalType: text("final_type"),
    finalKey: text("final_key"),
    templateId: uuid("template_id"),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (t) => [index("detect_feedback_norm_idx").on(t.sourceNorm, t.createdAt)],
);
