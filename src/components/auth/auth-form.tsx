"use client";

import { MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function AuthForm({ mode, next, initialError }: { mode: Mode; next: string; initialError?: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>(initialError ? { form: initialError } : {});
  const [loading, setLoading] = useState<"email" | "google" | "reset" | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const callback = (target: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`;

  function validate() {
    const e: Record<string, string> = {};
    if (mode === "signup" && name.trim().length < 2) e.name = "Enter your name";
    if (!emailOk(email)) e.email = "Enter a valid email";
    if (password.length < 8) e.password = "Use at least 8 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setLoading("email");
    const supabase = createClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(null);
      if (error) {
        setErrors({ form: error.message === "Invalid login credentials" ? "Email or password is incorrect" : error.message });
        toast.error("Couldn't sign in");
        return;
      }
      toast.success("Welcome back!");
      router.replace(next);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: callback(next) },
      });
      setLoading(null);
      if (error) {
        setErrors({ form: error.message });
        toast.error("Couldn't create your account");
        return;
      }
      if (data.session) {
        toast.success("Account created!");
        router.replace(next);
        router.refresh();
      } else {
        setSentTo(email);
        toast.success("Check your email to confirm your account");
      }
    }
  }

  async function google() {
    setLoading("google");
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback(next) } });
    if (error) {
      setLoading(null);
      toast.error("Google sign-in is unavailable", { description: error.message });
    }
  }

  async function forgot() {
    if (!emailOk(email)) {
      setErrors({ email: "Enter your email first, then tap “Forgot password”" });
      return;
    }
    setLoading("reset");
    const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: callback("/reset-password") });
    setLoading(null);
    if (error) {
      toast.error("Couldn't send reset email", { description: error.message });
      return;
    }
    toast.success("Password reset link sent", { description: `Check ${email}` });
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <MailCheckIcon className="mx-auto size-12 text-teal-strong" />
        <h2 className="text-xl font-semibold">Confirm your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a link to <strong className="text-foreground">{sentTo}</strong>. Open it on this device to finish signing up.
        </p>
        <Button variant="outline" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" size="lg" className="w-full" onClick={google} loading={loading === "google"} disabled={loading !== null}>
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2.1H12v4h6a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-7.9z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
        </svg>
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {mode === "signup" && (
          <Field id="name" label="Full name" error={errors.name}>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name) || undefined} />
          </Field>
        )}
        <Field id="email" label="Email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email) || undefined} />
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors.password}
          extra={
            mode === "login" && (
              <button type="button" onClick={forgot} className="text-xs font-medium text-teal-strong hover:underline" disabled={loading === "reset"}>
                {loading === "reset" ? "Sending…" : "Forgot password?"}
              </button>
            )
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password) || undefined}
          />
        </Field>
        {errors.form && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={loading === "email"} disabled={loading !== null && loading !== "email"}>
          {mode === "login" ? "Log in" : "Create account"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? "New to ParkSmart? " : "Already have an account? "}
        <Link href={`/${mode === "login" ? "signup" : "login"}?next=${encodeURIComponent(next)}`} className="font-semibold text-teal-strong hover:underline">
          {mode === "login" ? "Create an account" : "Log in"}
        </Link>
      </p>
    </div>
  );
}

function Field({ id, label, error, extra, children }: { id: string; label: string; error?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {extra}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
