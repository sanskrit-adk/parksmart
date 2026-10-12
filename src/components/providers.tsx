"use client";

import { ThemeProvider } from "next-themes";
import { createContext, useContext } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Profile } from "@/lib/types";

interface SessionValue {
  profile: Profile | null;
  email: string | null;
}

const SessionContext = createContext<SessionValue>({ profile: null, email: null });

export function useSession() {
  return useContext(SessionContext);
}

export function Providers({ children, session }: { children: React.ReactNode; session: SessionValue }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionContext.Provider value={session}>
        <TooltipProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </TooltipProvider>
      </SessionContext.Provider>
    </ThemeProvider>
  );
}
