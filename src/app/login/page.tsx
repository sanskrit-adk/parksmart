import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSession } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = safeNext(sp.next);
  const { user } = await getSession();
  if (user) redirect(next);
  return (
    <AuthShell title="Welcome back" subtitle="Log in to book, manage and check in to your parking.">
      <AuthForm mode="login" next={next} initialError={typeof sp.error === "string" ? sp.error : null} />
    </AuthShell>
  );
}
