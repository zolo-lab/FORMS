/**
 * Database schema (Drizzle). Phase-1 scope: organizations, users and the
 * form-builder tables. Requests, packages, signing steps, audit events, cost
 * centers, banks etc. are added in phase 2 per the design doc
 * ("אפיון מערכת טפסים וחתימה דיגיטלית") — extend this file, don't fork it.
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
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { FormDefinition } from "@/lib/forms/schema";
import type { PdfMapping } from "@/lib/forms/pdf-mapping";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const userRole = pgEnum("user_role", ["admin", "payroll", "approver", "org_office"]);
export const templateStatus = pgEnum("template_status", ["draft", "active", "archived"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** מספר עמותה, e.g. 580556306 */
  registrationNumber: text("registration_number").notNull().unique(),
  active: boolean("active").notNull().default(true),
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
 * File bytes (base64) for PDFs and uploads. Interim storage until Vercel Blob is connected;
 * all access goes through src/server/storage.ts so swapping the backend is local.
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
