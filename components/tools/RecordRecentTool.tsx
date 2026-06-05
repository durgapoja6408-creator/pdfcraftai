"use client";

// Mounted on /tool/[id] — records the visited tool into the client-only
// "recently used" list (localStorage). Renders nothing. Recording on the
// tool page (not on the /tools card click) captures every entry path,
// including direct links and SEO landings.

import { useEffect } from "react";
import { recordRecent } from "@/lib/client/tool-prefs";

export function RecordRecentTool({ id }: { id: string }) {
  useEffect(() => {
    recordRecent(id);
  }, [id]);
  return null;
}
