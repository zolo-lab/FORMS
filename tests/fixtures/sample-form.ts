import type { FormDefinition } from "@/lib/forms/schema";

/** A compact form exercising most field types, conditions and a repeating table. */
export const sampleForm: FormDefinition = {
  schemaVersion: 1,
  title: "טופס לדוגמה",
  pages: [
    {
      id: "personal",
      title: "פרטים אישיים",
      fields: [
        { id: "intro", type: "info_text", label: "נא למלא את כל הפרטים" },
        { id: "firstName", type: "short_text", label: "שם פרטי", required: true, validation: { maxLength: 30 } },
        { id: "lastName", type: "short_text", label: "שם משפחה", required: true },
        { id: "idNumber", type: "id_number", label: "מספר זהות", required: true },
        { id: "birthDate", type: "date", label: "תאריך לידה", required: true, validation: { maxDate: "today" } },
        { id: "mobile", type: "phone", label: "טלפון נייד", required: true },
        { id: "email", type: "email", label: "דוא\"ל" },
        { id: "address", type: "address", label: "כתובת", required: true },
        {
          id: "maritalStatus", type: "radio", label: "מצב משפחתי", required: true,
          options: [
            { value: "single", label: "רווק/ה" },
            { value: "married", label: "נשוי/אה" },
            { value: "divorced", label: "גרוש/ה" },
          ],
        },
        {
          id: "spouseName", type: "short_text", label: "שם בן/בת הזוג",
          visibleIf: { field: "maritalStatus", op: "eq", value: "married" },
          requiredIf: { field: "maritalStatus", op: "eq", value: "married" },
        },
        { id: "hasChildren", type: "yes_no", label: "יש לך ילדים?", required: true },
        {
          id: "children", type: "repeating_table", label: "ילדים",
          visibleIf: { field: "hasChildren", op: "eq", value: "yes" },
          settings: { minRows: 1, maxRows: 15 },
          fields: [
            { id: "name", type: "short_text", label: "שם", required: true },
            { id: "childId", type: "id_number", label: "מספר זהות", required: true },
            { id: "birthDate", type: "date", label: "תאריך לידה", required: true },
          ],
        },
      ],
    },
    {
      id: "employment",
      title: "העסקה",
      fields: [
        { id: "salary", type: "currency", label: "שכר חודשי", filledBy: "requester", required: true, validation: { min: 0 } },
        { id: "jobPercent", type: "percent", label: "אחוז משרה", filledBy: "requester", required: true },
        {
          id: "incomeTypes", type: "checkboxes", label: "סוגי הכנסה", required: true, validation: { minSelected: 1 },
          options: [
            { value: "monthly", label: "משכורת חודש", code: "2" },
            { value: "extra", label: "משכורת נוספת", code: "3" },
            { value: "partial", label: "משכורת חלקית", code: "4" },
          ],
        },
        { id: "bank", type: "bank_account", label: "חשבון בנק", required: true },
        { id: "declare", type: "consent", label: "אני מצהיר/ה שהפרטים נכונים", required: true },
        { id: "sig", type: "signature", label: "חתימת העובד", required: true },
      ],
    },
  ],
};

export const validAnswers = {
  firstName: "ישראל",
  lastName: "זולו",
  idNumber: "000000018",
  birthDate: "1990-05-01",
  mobile: "050-1234567",
  address: { city: "בית שאן", street: "הרצל", house: "12", apartment: "4", zip: "1090000" },
  maritalStatus: "single",
  hasChildren: "no",
  salary: 8500,
  jobPercent: 50,
  incomeTypes: ["monthly"],
  bank: { bank: "10", branch: "912", account: "12345678" },
  declare: true,
  sig: { image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" },
};
