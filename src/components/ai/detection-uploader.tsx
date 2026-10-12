"use client";

import { CameraIcon, LinkIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { relativeTime } from "@/lib/format";
import type { AiDetection } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Computer-vision spot detection: upload a lot photo or point at a camera
 * snapshot URL; shows the image with occupied/free bounding boxes.
 */
export function DetectionUploader({
  locations,
  initialLocationId,
  recent = [],
}: {
  locations: { id: string; name: string }[];
  initialLocationId?: string;
  recent?: AiDetection[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [locationId, setLocationId] = useState(initialLocationId ?? locations[0]?.id ?? "");
  const [cameraUrl, setCameraUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ detection: AiDetection; engine: string } | null>(recent[0] ? { detection: recent[0], engine: recent[0].model.split(":")[0] } : null);

  async function run() {
    setError(null);
    if (!locationId) return setError("Choose a location");
    if (!file && !cameraUrl.trim()) return setError("Upload a photo or enter a camera snapshot URL");
    if (cameraUrl && !/^https:\/\//.test(cameraUrl.trim())) return setError("Camera URL must start with https://");
    const form = new FormData();
    form.set("location_id", locationId);
    if (file) form.set("image", file);
    else form.set("camera_url", cameraUrl.trim());
    setLoading(true);
    try {
      const res = await fetch("/api/cv/detect", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Detection failed");
      setResult({ detection: data.detection, engine: data.engine });
      toast.success("Detection complete", {
        description: `${data.detection.free_count} free · ${data.detection.occupied_count} occupied. ${data.location.name} is now Live.`,
      });
      setFile(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      toast.error("Detection failed", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        {locations.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="cv-location">Location</Label>
            <NativeSelect id="cv-location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Lot photo</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > 10 * 1024 * 1024) {
                toast.error("Image must be under 10 MB");
                return;
              }
              setFile(f);
              setCameraUrl("");
              setError(null);
            }}
          />
          <Button variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
            <UploadIcon /> {file ? file.name : "Upload or take a photo"}
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cam-url">
            <LinkIcon className="size-4" /> Or camera snapshot URL
          </Label>
          <Input
            id="cam-url"
            placeholder="https://camera.example.com/snapshot.jpg"
            value={cameraUrl}
            onChange={(e) => {
              setCameraUrl(e.target.value);
              setFile(null);
              setError(null);
            }}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button variant="teal" size="lg" className="w-full" onClick={run} loading={loading}>
          <CameraIcon /> Detect spaces
        </Button>
        <p className="text-xs text-muted-foreground">
          Counts stay live for 30 minutes and feed the prediction history. Uses the YOLOv8 service when configured, otherwise a vision model.
        </p>
      </div>

      <div>
        {result ? (
          <DetectionView detection={result.detection} engine={result.engine} />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-2xl border-2 border-dashed text-sm text-muted-foreground">
            Detection results appear here
          </div>
        )}
      </div>
    </div>
  );
}

export function DetectionView({ detection: d, engine }: { detection: AiDetection; engine?: string }) {
  const total = d.free_count + d.occupied_count;
  return (
    <figure className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.image_url} alt="Parking lot with detected spaces outlined" className="block w-full" />
        {d.boxes.map((b, i) => (
          <span
            key={i}
            className={cn("absolute rounded-sm border-2", b.label === "occupied" ? "border-full bg-full/15" : "border-free bg-free/20")}
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
            title={`${b.label} (${Math.round(b.confidence * 100)}%)`}
          />
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border-2 border-free bg-free/20" /> {d.free_count} free
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border-2 border-full bg-full/15" /> {d.occupied_count} occupied
        </span>
        <span className="text-muted-foreground">
          {total ? `${Math.round((d.occupied_count / total) * 100)}% full` : "No spaces detected"} · {relativeTime(d.created_at)} ·{" "}
          {(engine ?? d.model.split(":")[0]) === "yolo" ? "YOLOv8" : "Vision AI (approximate boxes)"}
        </span>
      </figcaption>
    </figure>
  );
}
