import { Suspense } from "react";
import { Wizard } from "@/components/wizard";

export default function NewPage() {
  return (
    <Suspense fallback={<p role="status">טוען…</p>}>
      <Wizard />
    </Suspense>
  );
}
