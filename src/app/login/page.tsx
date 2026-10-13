import { redirect } from "next/navigation";
import { authDisabled } from "@/lib/auth/open-mode";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (authDisabled()) redirect("/admin/forms");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-bold">כניסה למערכת</h1>
      <LoginForm next={next ?? ""} />
    </main>
  );
}
