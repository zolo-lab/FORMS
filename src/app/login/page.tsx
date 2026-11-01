import { redirect } from "next/navigation";
import Link from "next/link";
import { authDisabled } from "@/lib/auth/open-mode";
import { devLoginEnabled } from "@/lib/auth/dev-login";
import { buttonVariants } from "@/components/ui/button";
import { LOGIN_ERRORS, googleConfigured } from "@/lib/auth/google";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; demo?: string }> }) {
  const { next, error, demo } = await searchParams;
  if (authDisabled() && !demo) redirect("/admin/forms");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-bold">כניסה למערכת</h1>
      {error && LOGIN_ERRORS[error] && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {LOGIN_ERRORS[error]}
        </p>
      )}
      {googleConfigured() && (
        <a className={buttonVariants({ variant: "outline", className: "mb-6 w-full" })} href={`/api/auth/google/start?next=${encodeURIComponent(next ?? "")}`}>
          כניסה עם Google
        </a>
      )}
      {(process.env.ADMIN_PASSWORD || demo) && <LoginForm next={next ?? ""} />}
      {devLoginEnabled() && <Link href="/dev-login" className="mt-6 text-center text-sm underline underline-offset-2">כניסה כמשתמש לבדיקה (בלי סיסמה)</Link>}
    </main>
  );
}
