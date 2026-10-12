"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function HostListingTabs({
  initial,
  overview,
  pricing,
  camera,
  edit,
}: {
  initial: string;
  overview: React.ReactNode;
  pricing: React.ReactNode;
  camera: React.ReactNode;
  edit: React.ReactNode;
}) {
  const [tab, setTab] = useState(initial);
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(String(v));
        window.history.replaceState(null, "", `?tab=${v}`);
      }}
    >
      <TabsList className="h-11 w-full overflow-x-auto sm:w-auto">
        <TabsTrigger value="overview" className="px-4">Overview</TabsTrigger>
        <TabsTrigger value="pricing" className="px-4">AI pricing</TabsTrigger>
        <TabsTrigger value="camera" className="px-4">Camera</TabsTrigger>
        <TabsTrigger value="edit" className="px-4">Edit</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-6">{overview}</TabsContent>
      <TabsContent value="pricing" className="mt-6">{pricing}</TabsContent>
      <TabsContent value="camera" className="mt-6">{camera}</TabsContent>
      <TabsContent value="edit" className="mt-6">{edit}</TabsContent>
    </Tabs>
  );
}
