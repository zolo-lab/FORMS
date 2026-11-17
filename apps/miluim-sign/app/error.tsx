"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md space-y-3 px-4 py-12">
      <h1 className="text-xl font-semibold">משהו השתבש</h1>
      <button type="button" className="min-h-11 cursor-pointer rounded-lg bg-primary px-4 text-primary-foreground" onClick={reset}>נסו שוב</button>
    </main>
  );
}
