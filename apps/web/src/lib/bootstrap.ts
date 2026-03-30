import { useQuery } from "@tanstack/react-query";
import type { PublicBootstrapResponse } from "@frontier/shared";

import { api } from "../api";

export function usePublicBootstrap() {
  return useQuery({
    queryKey: ["public-bootstrap"],
    queryFn: api.publicBootstrap,
    staleTime: Infinity,
    retry: false,
  });
}

export function getLaunchPhaseLabel(bootstrap: PublicBootstrapResponse | undefined): string {
  return bootstrap?.launchPhase === "closed_alpha" ? "Closed Alpha" : "Public Build";
}
