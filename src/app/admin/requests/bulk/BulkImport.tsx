"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ImportRecord, RowError, Target } from "@/lib/import/map";
import { checkImportAction, createImportChunkAction, parseImportAction, startImportJobAction } from "./actions";

const CHUNK = 10;

type Phase = "upload" | "map" | "checked" | "running" | "done";

export function BulkImport({ packages, orgs }: { packages: { id: string; name: string }[]; orgs: { id: string; name: string; projects: { id: string; name: string }[]; projectRequired: boolean }[] }) {
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [organizationId, setOrganizationId] = useState(orgs[0]?.id ?? "");
  const [projectId, setProjectId] = useState(orgs[0]?.projectRequired ? (orgs[0].projects[0]?.id ?? "") : "");
  const currentOrg = orgs.find((o) => o.id === organizationId);
  const [send, setSend] = useState(false);
  const [campaign, setCampaign] = useState("");
  const [phase, setPhase] = useState<Phase>("upload");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState(0);
  const [created, setCreated] = useState(0);
  const [pending, start] = useTransition();

  function upload(fd: FormData) {
    setError(null);
    fd.set("packageId", packageId);
    start(async () => {
      const res = await parseImportAction(fd);
      if (!res.ok) return setError(res.error);
      setRows(res.rows);
      setTargets(res.targets);
      setMapping(res.mapping);
      setPhase("map");
    });
  }

  function check() {
    setError(null);
    start(async () => {
      const res = await checkImportAction({ packageId, rows, mapping, send });
      if (!res.ok) return setError(res.error);
      setRecords(res.records);
      setErrors(res.errors);
      setTotal(res.total);
      setPhase("checked");
    });
  }

  function run() {
    setPhase("running");
    setError(null);
    start(async () => {
      const job = await startImportJobAction({ packageId, organizationId, projectId: projectId || undefined, rowCount: records.length, campaign: campaign.trim() || undefined });
      if ("error" in job) {
        setError(job.error);
        return setPhase("checked");
      }
      let ok = 0;
      const failed: RowError[] = [...errors];
      for (let i = 0; i < records.length; i += CHUNK) {
        const chunk = records.slice(i, i + CHUNK);
        const res = await createImportChunkAction({ jobId: job.jobId, packageId, organizationId, projectId: projectId || undefined, records: chunk, send, final: i + CHUNK >= records.length, campaign: campaign.trim() || undefined });
        ok += res.created;
        failed.push(...res.errors);
        setCreated(ok);
        setProgress(Math.min(records.length, i + CHUNK));
      }
      setErrors(failed.sort((a, b) => a.row - b.row));
      setPhase("done");
    });
  }

  function downloadErrors() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = "﻿שורה,שגיאה\r\n" + errors.map((e) => `${e.row},${esc(e.message)}`).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="bulk-pkg">ערכת מסמכים</Label>
            <Select id="bulk-pkg" value={packageId} disabled={phase !== "upload"} onChange={(e) => setPackageId(e.target.value)}>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bulk-org">ארגון</Label>
            <Select id="bulk-org" value={organizationId} disabled={phase === "running" || phase === "done"} onChange={(e) => {
              setOrganizationId(e.target.value);
              const o = orgs.find((x) => x.id === e.target.value);
              setProjectId(o?.projectRequired ? (o.projects[0]?.id ?? "") : "");
            }}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </div>
          {currentOrg && currentOrg.projects.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="bulk-project">פרויקט</Label>
              <Select id="bulk-project" value={projectId} disabled={phase === "running" || phase === "done"} onChange={(e) => setProjectId(e.target.value)}>
                {!currentOrg.projectRequired && <option value="">ללא פרויקט</option>}
                {currentOrg.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <div className="space-y-1 sm:max-w-sm">
          <Label htmlFor="bulk-campaign">שם קמפיין (לא חובה)</Label>
          <Input id="bulk-campaign" value={campaign} maxLength={60} placeholder='למשל "101 2027"' disabled={phase === "running" || phase === "done"} onChange={(e) => setCampaign(e.target.value)} />
          <p className="text-xs text-muted-foreground">כל הבקשות מהקובץ יסומנו בשם הזה ויופיעו יחד במסך &quot;קמפיינים&quot;, עם אחוז החתומים לכל עמותה.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={send} disabled={phase === "running" || phase === "done"} onChange={(e) => setSend(e.target.checked)} />
          לשלוח מיד לחתימה (אחרת הבקשות נשמרות כטיוטות)
        </label>
      </Card>

      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {phase === "upload" && (
        <Card className="p-4">
          <form action={upload} className="space-y-3">
            <Label htmlFor="bulk-file">קובץ XLSX או CSV (עד 2MB, עד 2000 שורות)</Label>
            <Input id="bulk-file" name="file" type="file" accept=".xlsx,.csv,text/csv" required />
            <Button type="submit" disabled={pending || !packageId}>{pending ? "קורא…" : "קרא קובץ"}</Button>
          </form>
        </Card>
      )}

      {phase === "map" && (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">מיפוי עמודות ({rows.length - 1} שורות)</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {targets.map((t) => (
              <div key={t.key} className="space-y-1">
                <Label htmlFor={`map-${t.key}`}>{t.label}{t.required ? " *" : ""}</Label>
                <Select
                  id={`map-${t.key}`}
                  value={mapping[t.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [t.key]: e.target.value === "" ? null : Number(e.target.value) })}
                >
                  <option value="">— לא ממופה —</option>
                  {rows[0]!.map((h, i) => (
                    <option key={i} value={i}>{h || `עמודה ${i + 1}`}</option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={check} disabled={pending}>{pending ? "בודק…" : "בדוק נתונים"}</Button>
            <Button variant="ghost" onClick={() => setPhase("upload")}>קובץ אחר</Button>
          </div>
        </Card>
      )}

      {(phase === "checked" || phase === "done") && (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">{phase === "done" ? "הסתיים" : "תוצאות הבדיקה"}</h2>
          {phase === "done" ? (
            <p data-testid="bulk-result">נוצרו {created} בקשות, {errors.length} שורות נכשלו.</p>
          ) : (
            <p data-testid="bulk-check">{records.length} מתוך {total} שורות תקינות, {errors.length} עם שגיאות.</p>
          )}
          {errors.length > 0 && (
            <>
              <ul className="max-h-64 space-y-1 overflow-auto text-sm">
                {errors.map((e, i) => (
                  <li key={i}><span className="font-medium">שורה {e.row}:</span> {e.message}</li>
                ))}
              </ul>
              <Button variant="ghost" onClick={downloadErrors}>הורד דוח שגיאות (CSV)</Button>
            </>
          )}
          {phase === "checked" && (
            <div className="flex gap-2">
              <Button onClick={run} disabled={records.length === 0}>צור {records.length} בקשות</Button>
              <Button variant="ghost" onClick={() => setPhase("map")}>חזרה למיפוי</Button>
            </div>
          )}
        </Card>
      )}

      {phase === "running" && (
        <Card className="space-y-2 p-4">
          <p>יוצר בקשות… {progress} מתוך {records.length}</p>
          <progress className="w-full" value={progress} max={records.length} />
        </Card>
      )}
    </div>
  );
}
