import { fieldStyleClass } from "@/lib/forms/field-style";
import type { FormField } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import { Markdown } from "../Markdown";

export function LayoutBlock({ field, pipe = (t) => t }: { field: FormField; pipe?: (text: string) => string }) {
  switch (field.type) {
    case "heading":
      return (
        <div className="pt-2">
          <h3 className={cn("text-lg font-semibold", fieldStyleClass(field.style))}>{pipe(field.label)}</h3>
          {field.description && <p className="text-sm text-muted-foreground">{pipe(field.description)}</p>}
        </div>
      );
    case "info_text":
      return <Markdown text={pipe(field.label)} className={cn("rounded-md bg-muted p-3 text-sm", fieldStyleClass(field.style))} />;
    case "image": {
      const src = String(field.settings?.src ?? "");
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-provided URL
      return src ? <img src={src} alt={String(field.settings?.alt ?? "")} className="max-w-full rounded-md" /> : null;
    }
    case "section":
      return (
        <div className="mt-4 rounded-md border-s-4 border-primary bg-muted px-3 py-2">
          <h3 className={cn("text-base font-semibold", fieldStyleClass(field.style))}>{pipe(field.label)}</h3>
          {field.description && <p className="text-sm text-muted-foreground">{pipe(field.description)}</p>}
        </div>
      );
    case "divider":
      return <hr className="my-2" />;
    default:
      return null;
  }
}
