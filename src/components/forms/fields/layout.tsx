import type { FormField } from "@/lib/forms/schema";

export function LayoutBlock({ field }: { field: FormField }) {
  switch (field.type) {
    case "heading":
      return (
        <div className="pt-2">
          <h3 className="text-lg font-semibold">{field.label}</h3>
          {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
        </div>
      );
    case "info_text":
      return <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">{field.label}</p>;
    case "image": {
      const src = String(field.settings?.src ?? "");
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-provided URL
      return src ? <img src={src} alt={String(field.settings?.alt ?? "")} className="max-w-full rounded-md" /> : null;
    }
    case "divider":
      return <hr className="my-2" />;
    default:
      return null;
  }
}
