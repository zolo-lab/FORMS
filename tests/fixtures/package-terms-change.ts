/**
 * Test package "שינוי תנאים" (iForms "העסקה- שינוי תנאים"): the request form the manager fills, with the iForms field
 * ids the Make scenario sends, two internal (staff-only) fields, and the chain employee → approver chosen in the
 * request → payroll. No personal data.
 */
import type { FormDefinition } from "@/lib/forms/schema";
import type { Workflow } from "@/lib/workflow/types";

const req = (id: string, label: string, type: FormDefinition["pages"][number]["fields"][number]["type"] = "short_text", extra: Record<string, unknown> = {}) =>
  ({ id, type, label, filledBy: "requester" as const, ...extra });

export const termsChangeRequest: FormDefinition = {
  schemaVersion: 1,
  title: "שינוי תנאים – בקשה",
  pages: [
    {
      id: "request",
      title: "פרטי הבקשה",
      fields: [
        req("fname", "שם פרטי", "short_text", { required: true }),
        req("lname", "שם משפחה", "short_text", { required: true }),
        req("id_number", "תעודת זהות", "id_number", { required: true }),
        req("mobile", "נייד", "phone"),
        req("email_address", "מייל", "email", { required: true }),
        req("salary", "שכר", "currency", { required: true }),
        req("salary_interval", "השכר הוא ל", "radio", { options: [{ value: "hour", label: "שעה" }, { value: "month", label: "חודש" }] }),
        req("travels", "החזר נסיעות"),
        req("job_scope", "היקף משרה"),
        req("work_time", "אורך תקופה"),
        req("start_work_date", "תאריך תחילה או שינוי", "date", { required: true }),
        req("boss_name", "מעסיק ישיר"),
        req("company_name", "הגוף המעביד"),
        req("Organization_name", "עמותה"),
        req("job_main_description", "תיאור תפקיד", "long_text"),
        req("additional_conditions", "תנאים נוספים", "long_text"),
        req("contract_number", "מספר חוזה"),
        req("manager", "גורם מאשר (מייל)", "email", { required: true }),
        req("cost_center", "מרכז רווח", "short_text", { internal: true, required: true }),
        req("department", "מחלקה – חשבון הוצאה", "short_text", { internal: true }),
      ],
    },
    {
      id: "employee",
      title: "אישור העובד",
      fields: [
        { id: "employee_ack", type: "consent", label: "קראתי ואני מאשר/ת את התנאים", required: true, filledBy: "employee" },
        { id: "employee_signature", type: "signature", label: "חתימת העובד", required: true, filledBy: "employee" },
      ],
    },
    {
      id: "approver",
      title: "אישור",
      fields: [{ id: "approver_signature", type: "signature", label: "חתימת הגורם המאשר", filledBy: "approver" }],
    },
  ],
  settings: { layout: "wizard" },
};

export const termsChangeWorkflow: Workflow = {
  steps: [
    { order: 1, role: "requester", action: "fill" },
    { order: 2, role: "employee", action: "fill_and_sign" },
    { order: 3, role: "approver", action: "approve", assigneeKind: "from_field", assigneeFromFieldId: "manager" },
    { order: 4, role: "payroll", action: "approve", assignee: { name: "חשבות שכר", email: "payroll@example.test" } },
  ],
};

export const termsChangeAnswers = {
  fname: "דנה",
  lname: "בדיקה",
  id_number: "000000018",
  mobile: "0500000000",
  email_address: "employee@example.test",
  salary: 9000,
  salary_interval: "month",
  start_work_date: "2026-11-15",
  manager: "approver@example.test",
  cost_center: "2001-100",
  department: "ת\"ת",
};
