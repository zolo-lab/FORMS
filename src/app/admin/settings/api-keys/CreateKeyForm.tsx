"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createApiKeyAction, type CreateKeyState } from "./actions";

export function CreateKeyForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="ak-org">ארגון</Label>
        <Select id="ak-org" name="organizationId" required>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ak-name">שם המפתח</Label>
        <Input id="ak-name" name="name" placeholder="Make" required />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>יצירת מפתח</Button>
      </div>
      {state?.error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
      {state?.key && (
        <div role="status" className="space-y-1 rounded-md border border-warning bg-warning/10 p-3 sm:col-span-2">
          <p className="text-sm font-medium">המפתח נוצר. העתיקו אותו עכשיו: הוא לא יוצג שוב.</p>
          <code className="block break-all rounded bg-card p-2 text-sm" dir="ltr" data-testid="new-api-key">{state.key}</code>
        </div>
      )}
    </form>
  );
}
