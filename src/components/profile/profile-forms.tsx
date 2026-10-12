"use client";

import { AccessibilityIcon, CarIcon, StarIcon, Trash2Icon, UmbrellaIcon, ZapIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { normalizePlate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserPreferences, Vehicle } from "@/lib/types";

export function ProfileDetails({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Enter your name";
    if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) errs.phone = "Enter a valid phone number";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const { error } = await createClient().from("profiles").update({ name: name.trim(), phone: phone.trim() || null }).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error("Couldn't save your profile");
    toast.success("Profile saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
        <CardDescription>
          {email} · {profile.role === "admin" ? "Admin" : profile.role === "host" ? "Host" : "Driver"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name) || undefined} />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={Boolean(errors.phone) || undefined} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
            </div>
          </div>
          <Button type="submit" loading={saving}>
            Save details
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AiPreferences({ profile }: { profile: Profile }) {
  const [prefs, setPrefs] = useState<UserPreferences>(profile.preferences ?? {});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof UserPreferences>(k: K, v: UserPreferences[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    const { error } = await createClient().from("profiles").update({ preferences: prefs }).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error("Couldn't save preferences");
    toast.success("Preferences saved", { description: "AI Picks now reflect them." });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI preferences</CardTitle>
        <CardDescription>Used to rank results and choose your AI Pick.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {[
          { k: "prefer_covered" as const, icon: UmbrellaIcon, label: "Prefer covered parking" },
          { k: "prefer_ev" as const, icon: ZapIcon, label: "Prefer EV charging" },
          { k: "need_accessible" as const, icon: AccessibilityIcon, label: "I need accessible parking" },
        ].map(({ k, icon: Icon, label }) => (
          <label key={k} className="flex min-h-11 items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 text-sm">
              <Icon className="size-4 text-muted-foreground" /> {label}
            </span>
            <Switch checked={Boolean(prefs[k])} onCheckedChange={(v) => set(k, v)} />
          </label>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="walk">Max walk</Label>
            <NativeSelect id="walk" value={prefs.max_walk_minutes ?? 12} onChange={(e) => set("max_walk_minutes", Number(e.target.value))}>
              {[3, 5, 8, 12, 15, 20].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price-sens">Price matters</Label>
            <NativeSelect
              id="price-sens"
              value={prefs.price_sensitivity ?? "medium"}
              onChange={(e) => set("price_sensitivity", e.target.value as UserPreferences["price_sensitivity"])}
            >
              <option value="low">A little: convenience first</option>
              <option value="medium">Balanced</option>
              <option value="high">A lot: cheapest first</option>
            </NativeSelect>
          </div>
        </div>
        <Button onClick={save} loading={saving}>
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}

export function VehiclesCard({ userId, initial }: { userId: string; initial: Vehicle[] }) {
  const [vehicles, setVehicles] = useState(initial);
  const [plate, setPlate] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const supabase = createClient();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePlate(plate);
    if (!/^[A-Z0-9]{2,8}$/.test(p)) return setError("Plates are 2–8 letters or digits");
    if (vehicles.some((v) => v.plate === p)) return setError("You've already saved this plate");
    setBusy("add");
    const { data, error: err } = await supabase
      .from("vehicles")
      .insert({ user_id: userId, plate: p, label: label.trim() || null, is_default: vehicles.length === 0 })
      .select("*")
      .single();
    setBusy(null);
    if (err || !data) return toast.error("Couldn't add the vehicle");
    if (vehicles.length === 0) await supabase.from("profiles").update({ vehicle_plate: p }).eq("id", userId);
    setVehicles((v) => [...v, data as Vehicle]);
    setPlate("");
    setLabel("");
    setError(null);
    toast.success(`${p} saved`);
  }

  async function remove(v: Vehicle) {
    setBusy(v.id);
    const { error: err } = await supabase.from("vehicles").delete().eq("id", v.id);
    setBusy(null);
    if (err) return toast.error("Couldn't remove the vehicle");
    setVehicles((list) => list.filter((x) => x.id !== v.id));
    toast.success(`${v.plate} removed`);
  }

  async function makeDefault(v: Vehicle) {
    setBusy(v.id);
    await supabase.from("vehicles").update({ is_default: false }).eq("user_id", userId);
    const { error: err } = await supabase.from("vehicles").update({ is_default: true }).eq("id", v.id);
    await supabase.from("profiles").update({ vehicle_plate: v.plate }).eq("id", userId);
    setBusy(null);
    if (err) return toast.error("Couldn't update default vehicle");
    setVehicles((list) => list.map((x) => ({ ...x, is_default: x.id === v.id })));
    toast.success(`${v.plate} is now your default`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved vehicles</CardTitle>
        <CardDescription>Used for plate check-in and pre-filled when you book.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {vehicles.length === 0 && <p className="text-sm text-muted-foreground">No vehicles yet.</p>}
        <ul className="space-y-2">
          {vehicles.map((v) => (
            <li key={v.id} className="flex items-center gap-3 rounded-xl border p-3">
              <CarIcon className="size-5 text-teal-strong" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-mono font-semibold tracking-widest">{v.plate}</p>
                {v.label && <p className="truncate text-xs text-muted-foreground">{v.label}</p>}
              </div>
              {v.is_default ? (
                <span className="text-xs font-medium text-teal-strong">Default</span>
              ) : (
                <Button size="xs" variant="ghost" onClick={() => makeDefault(v)} disabled={busy === v.id}>
                  <StarIcon /> Make default
                </Button>
              )}
              <Button size="icon-sm" variant="ghost" onClick={() => remove(v)} loading={busy === v.id} aria-label={`Remove ${v.plate}`}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" noValidate>
          <div>
            <Label htmlFor="new-plate" className="sr-only">
              Plate
            </Label>
            <Input
              id="new-plate"
              placeholder="Plate, e.g. 8ABC123"
              value={plate}
              onChange={(e) => {
                setPlate(e.target.value.toUpperCase());
                setError(null);
              }}
              aria-invalid={Boolean(error) || undefined}
              className="font-mono tracking-wider"
            />
          </div>
          <div>
            <Label htmlFor="new-label" className="sr-only">
              Label
            </Label>
            <Input id="new-label" placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
          </div>
          <Button type="submit" className="h-11" loading={busy === "add"}>
            Add vehicle
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
