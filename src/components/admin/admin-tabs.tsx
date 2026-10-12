"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminTabs({ panels }: { panels: { value: string; label: string; content: React.ReactNode }[] }) {
  const [tab, setTab] = useState(panels[0].value);
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4">
        <TabsList className="h-11">
          {panels.map((p) => (
            <TabsTrigger key={p.value} value={p.value} className="px-4">
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {panels.map((p) => (
        <TabsContent key={p.value} value={p.value} className="mt-6">
          {p.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
