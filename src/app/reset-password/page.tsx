"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setSaving(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(err.message.includes("session") ? "Your reset link has expired. Request a new one from the login page." : err.message);
      return;
    }
    toast.success("Password updated");
    router.replace("/find");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-3xl font-bold">Choose a new password</h1>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw2">Confirm password</Label>
          <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={saving}>
          Update password
        </Button>
      </form>
    </div>
  );
}
