"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { parseFilters, serializeFilters, type ExplorerFilters } from "./filters";

export function useExplorerFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(search.toString())), [search]);
  const update = useCallback((next: ExplorerFilters) => {
    const query = serializeFilters(next).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);
  return { filters, update };
}
