import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSession } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const sp = await props.searchParams;
  const next = safeNext(sp.next);
  const { user } = await getSession();
  if (user) redirect(next);
  return (
    <AuthShell title="Create your account" subtitle="Free to join. Book parking in seconds or list your own space.">
      <AuthForm mode="signup" next={next} />
    </AuthShell>
  );
}
