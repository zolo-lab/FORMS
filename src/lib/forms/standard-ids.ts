/**
 * Standard field ids ("שם מזהה") shared with iForms and the tracking spreadsheet.
 *
 * The Make scenario that sends personal links fills iForms fields by these names (user_data). Using the same ids
 * here means the same row of "מעקב עובדים" can be sent to either system, and bulk import matches columns by them.
 */
export const STANDARD_FIELD_IDS = [
  { id: "fname", label: "שם פרטי" },
  { id: "lname", label: "שם משפחה" },
  { id: "id_number", label: "תעודת זהות" },
  { id: "mobile", label: "טלפון נייד" },
  { id: "email_address", label: "כתובת מייל" },
  { id: "company_name", label: "שם המעביד (עמותה)" },
  { id: "Organization_name", label: "שם הארגון" },
  { id: "start_work_date", label: "תאריך תחילת עבודה / שינוי" },
  { id: "work_time", label: "תקופת העסקה" },
  { id: "job_main_description", label: "תיאור תפקיד" },
  { id: "job_scope", label: "היקף משרה" },
  { id: "boss_name", label: "ממונה ישיר" },
  { id: "salary", label: "סכום השכר" },
  { id: "salary_interval", label: "השכר הוא ל (שעה/חודש)" },
  { id: "travels", label: "החזר נסיעות" },
  { id: "additional_conditions", label: "תנאים נוספים" },
  { id: "mispar_tik", label: "מספר תיק ניכויים" },
  { id: "contract_number", label: "מספר חוזה" },
  { id: "manager", label: "גורם מאשר" },
  { id: "user_signature", label: "חתימת העובד" },
] as const;

export type StandardFieldId = (typeof STANDARD_FIELD_IDS)[number]["id"];
