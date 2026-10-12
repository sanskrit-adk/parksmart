"use client";

import { ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

const MAX = 8;

/** Uploads listing photos to Supabase Storage (location-photos/<uid>/…). */
export function PhotoUploader({ photos, onChange }: { photos: string[]; onChange: (urls: string[]) => void }) {
  const { profile } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function upload(files: FileList | null) {
    if (!files?.length || !profile) return;
    const room = MAX - photos.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) toast.info(`Up to ${MAX} photos — extra files were skipped`);
    const supabase = createClient();
    const urls: string[] = [];
    setUploading(list.length);
    for (const file of list) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error(`${file.name}: use JPEG, PNG or WebP`);
        setUploading((n) => n - 1);
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name}: max 8 MB`);
        setUploading((n) => n - 1);
        continue;
      }
      const ext = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("location-photos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      setUploading((n) => n - 1);
      if (error) {
        toast.error(`Upload failed: ${file.name}`);
        continue;
      }
      urls.push(supabase.storage.from("location-photos").getPublicUrl(path).data.publicUrl);
    }
    if (urls.length) {
      onChange([...photos, ...urls]);
      toast.success(`${urls.length} photo${urls.length > 1 ? "s" : ""} uploaded`);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((url, i) => (
          <li key={url} className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
            <Image src={url} alt={`Listing photo ${i + 1}`} fill sizes="200px" className="object-cover" />
            {i === 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">Cover</span>}
            <button
              type="button"
              onClick={() => onChange(photos.filter((p) => p !== url))}
              className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label={`Remove photo ${i + 1}`}
            >
              <XIcon className="size-4" />
            </button>
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <li key={`u${i}`} className="flex aspect-[4/3] items-center justify-center rounded-xl border bg-muted">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          </li>
        ))}
        {photos.length + uploading < MAX && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:bg-muted"
            >
              <ImagePlusIcon className="size-6" /> Add photos
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => upload(e.target.files).finally(() => (e.target.value = ""))} />
      <p className="text-xs text-muted-foreground">Clear photos of the entrance and the space get more bookings. JPEG/PNG/WebP, up to 8 MB each.</p>
    </div>
  );
}
