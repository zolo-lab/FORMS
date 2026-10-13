"use client";

/** Header checkbox that ticks every row checkbox (name="id") of the bulk form. */
export function SelectAll({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="בחירת כל השורות"
      className="size-4 accent-primary"
      onChange={(e) => {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        form?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="id"]').forEach((c) => {
          c.checked = e.target.checked;
        });
      }}
    />
  );
}
