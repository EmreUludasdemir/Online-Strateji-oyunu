import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AllianceStateResponse,
  BuildingType,
  GameStateResponse,
  ResearchType,
  TroopStock,
  TroopType,
  WorldChunkResponse,
} from "@frontier/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import { api, ApiClientError } from "../api";
import { formatNumber } from "../lib/formatters";
import styles from "./GameLayout.module.css";

export interface GameLayoutContext {
  state: GameStateResponse;
  selectedCityId: string | null;
  setSelectedCityId: (cityId: string | null) => void;
  upgrade: (buildingType: BuildingType) => Promise<void>;
  train: (troopType: TroopType, quantity: number) => Promise<void>;
  research: (researchType: ResearchType) => Promise<void>;
  sendMarch: (payload: { targetCityId: string; commanderId: string; troops: TroopStock }) => Promise<void>;
  recallMarch: (marchId: string) => Promise<void>;
  isUpgrading: boolean;
  isTraining: boolean;
  isResearching: boolean;
  isSendingMarch: boolean;
  isRecallingMarch: boolean;
  notice: string | null;
  clearNotice: () => void;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    select_map_city?: (cityId: string | null) => void;
  }
}

function useSocketNotifications(enabled: boolean, onNotice: (message: string) => void): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let socket: WebSocket | null = null;
    const timer = window.setTimeout(() => {
      socket = new WebSocket(`${protocol}://${window.location.hostname}:3101/ws`);

      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data) as { type: string };

        if (
          payload.type === "city.updated" ||
          payload.type === "upgrade.completed" ||
          payload.type === "training.completed" ||
          payload.type === "research.completed"
        ) {
          queryClient.invalidateQueries({ queryKey: ["game-state"] });
        }

        if (
          payload.type === "map.updated" ||
          payload.type === "fog.updated" ||
          payload.type === "march.created" ||
          payload.type === "march.updated"
        ) {
          queryClient.invalidateQueries({ queryKey: ["world-chunk"] });
        }

        if (payload.type === "report.created" || payload.type === "battle.resolved") {
          queryClient.invalidateQueries({ queryKey: ["battle-reports"] });
          queryClient.invalidateQueries({ queryKey: ["game-state"] });
          queryClient.invalidateQueries({ queryKey: ["world-chunk"] });
        }

        if (payload.type === "alliance.updated") {
          queryClient.invalidateQueries({ queryKey: ["alliance-state"] });
          queryClient.invalidateQueries({ queryKey: ["game-state"] });
        }

        if (payload.type === "upgrade.completed") onNotice("A building upgrade completed.");
        if (payload.type === "training.completed") onNotice("Fresh troops completed their drill cycle.");
        if (payload.type === "research.completed") onNotice("A research order completed at the academy.");
        if (payload.type === "battle.resolved") onNotice("A march resolved on the frontier.");
      });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [enabled, onNotice, queryClient]);
}

export function GameLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.session,
    retry: false,
  });

  const stateQuery = useQuery({
    queryKey: ["game-state"],
    queryFn: api.gameState,
    enabled: Boolean(sessionQuery.data?.user),
    refetchInterval: 10_000,
  });

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: (buildingType: BuildingType) => api.startUpgrade(buildingType),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["game-state"] });
      setNotice("Construction order accepted.");
    },
  });

  const trainMutation = useMutation({
    mutationFn: (payload: { troopType: TroopType; quantity: number }) => api.trainTroops(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["game-state"] });
      setNotice("Training order posted to the barracks.");
    },
  });

  const researchMutation = useMutation({
    mutationFn: (payload: { researchType: ResearchType }) => api.startResearch(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["game-state"] });
      await queryClient.invalidateQueries({ queryKey: ["world-chunk"] });
      setNotice("Research order accepted by the academy.");
    },
  });

  const marchMutation = useMutation({
    mutationFn: (payload: { targetCityId: string; commanderId: string; troops: TroopStock }) => api.createMarch(payload),
    onSuccess: async ({ march }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
      ]);
      setNotice(`March dispatched toward ${march.targetCityName}. ETA ${march.remainingSeconds}s.`);
    },
  });

  const recallMutation = useMutation({
    mutationFn: (marchId: string) => api.recallMarch(marchId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
      ]);
      setNotice("March recalled to the city.");
    },
  });

  const handleNotice = useCallback((message: string) => {
    setNotice(message);
  }, []);

  useSocketNotifications(Boolean(stateQuery.data), handleNotice);

  const contextValue = useMemo<GameLayoutContext | null>(() => {
    if (!stateQuery.data) {
      return null;
    }

    return {
      state: stateQuery.data,
      selectedCityId,
      setSelectedCityId,
      upgrade: async (buildingType: BuildingType) => {
        await upgradeMutation.mutateAsync(buildingType);
      },
      train: async (troopType: TroopType, quantity: number) => {
        await trainMutation.mutateAsync({ troopType, quantity });
      },
      research: async (researchType: ResearchType) => {
        await researchMutation.mutateAsync({ researchType });
      },
      sendMarch: async (payload) => {
        await marchMutation.mutateAsync(payload);
      },
      recallMarch: async (marchId: string) => {
        await recallMutation.mutateAsync(marchId);
      },
      isUpgrading: upgradeMutation.isPending,
      isTraining: trainMutation.isPending,
      isResearching: researchMutation.isPending,
      isSendingMarch: marchMutation.isPending,
      isRecallingMarch: recallMutation.isPending,
      notice,
      clearNotice: () => setNotice(null),
    };
  }, [marchMutation, notice, recallMutation, researchMutation, selectedCityId, stateQuery.data, trainMutation, upgradeMutation]);

  useEffect(() => {
    if (!stateQuery.data) {
      return;
    }

    window.render_game_to_text = () => {
      const worldChunk = queryClient.getQueryData<WorldChunkResponse>(["world-chunk"]);
      const allianceState = queryClient.getQueryData<AllianceStateResponse>(["alliance-state"]);
      const selectedCity = worldChunk?.cities.find((city) => city.cityId === selectedCityId) ?? null;

      return JSON.stringify({
        screen: location.pathname,
        city: {
          name: stateQuery.data.city.cityName,
          coordinates: stateQuery.data.city.coordinates,
          resources: stateQuery.data.city.resources,
          activeUpgrade: stateQuery.data.city.activeUpgrade,
          activeTraining: stateQuery.data.city.activeTraining,
          activeResearch: stateQuery.data.city.activeResearch,
          activeMarches: stateQuery.data.city.activeMarches,
          troops: stateQuery.data.city.troops.map((troop) => ({
            type: troop.type,
            quantity: troop.quantity,
          })),
          commanders: stateQuery.data.city.commanders.map((commander) => ({
            id: commander.id,
            name: commander.name,
            isPrimary: commander.isPrimary,
          })),
          research: stateQuery.data.city.research.map((research) => ({
            type: research.type,
            level: research.level,
            isActive: research.isActive,
          })),
        },
        alliance: {
          summary: stateQuery.data.alliance,
          loaded: Boolean(allianceState),
          name: allianceState?.alliance?.name ?? null,
          tag: allianceState?.alliance?.tag ?? null,
          memberCount: allianceState?.alliance?.memberCount ?? 0,
          openHelpRequests: allianceState?.alliance?.helpRequests.length ?? 0,
          treasury: allianceState?.alliance?.treasury ?? null,
        },
        selectedCity,
        map: {
          loaded: Boolean(worldChunk),
          center: worldChunk?.center,
          tiles: {
            visible: worldChunk?.tiles.filter((tile) => tile.state === "VISIBLE").length ?? 0,
            discovered: worldChunk?.tiles.filter((tile) => tile.state !== "HIDDEN").length ?? 0,
          },
          cities:
            worldChunk?.cities.map((city) => ({
              cityId: city.cityId,
              ownerName: city.ownerName,
              x: city.x,
              y: city.y,
              fogState: city.fogState,
              canSendMarch: city.canSendMarch,
              isCurrentPlayer: city.isCurrentPlayer,
              projectedOutcome: city.projectedOutcome,
            })) ?? [],
          marches: worldChunk?.marches ?? [],
        },
        coordinateSystem: {
          origin: "top-left",
          xAxis: "increases to the right",
          yAxis: "increases downward",
        },
      });
    };

    window.advanceTime = (ms: number) => {
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["game-state"] });
        queryClient.invalidateQueries({ queryKey: ["world-chunk"] });
        queryClient.invalidateQueries({ queryKey: ["battle-reports"] });
      }, ms);
    };

    window.select_map_city = (cityId: string | null) => {
      setSelectedCityId(cityId);
    };

    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
      delete window.select_map_city;
    };
  }, [location.pathname, queryClient, selectedCityId, stateQuery.data]);

  if (sessionQuery.isError) {
    return <div className={styles.feedback}>Unable to restore the current session.</div>;
  }

  if (sessionQuery.data && !sessionQuery.data.user) {
    return <Navigate to="/login" replace />;
  }

  if (stateQuery.isError) {
    const error = stateQuery.error;
    if (error instanceof ApiClientError && error.status === 401) {
      return <Navigate to="/login" replace />;
    }

    return <div className={styles.feedback}>Unable to load the game state.</div>;
  }

  if (sessionQuery.isPending || stateQuery.isPending) {
    return <div className={styles.feedback}>Loading frontier state...</div>;
  }

  if (!contextValue) {
    return <div className={styles.feedback}>Loading frontier state...</div>;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <p className={styles.brandKicker}>Frontier Dominion</p>
          <h1 className={styles.brandTitle}>{contextValue.state.city.cityName}</h1>
          <p className={styles.brandMeta}>Commander: {contextValue.state.player.username}</p>
          <p className={styles.brandMeta}>Vision radius: {formatNumber(contextValue.state.city.visionRadius)}</p>
        </div>

        <nav className={styles.nav}>
          <NavLink to="/app/dashboard" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            City
          </NavLink>
          <NavLink to="/app/map" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            World Map
          </NavLink>
          <NavLink to="/app/reports" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            Reports
          </NavLink>
          <NavLink to="/app/alliance" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            Alliance
          </NavLink>
        </nav>

        <div className={styles.sidebarSummary}>
          <span>Open marches</span>
          <strong>{formatNumber(contextValue.state.city.openMarchCount)}</strong>
        </div>

        <button className={styles.logoutButton} type="button" onClick={() => logoutMutation.mutate()}>
          Log out
        </button>
      </aside>

      <div className={styles.main}>
        <header className={styles.resourceBar}>
          {Object.entries(contextValue.state.city.resources).map(([key, value]) => (
            <div key={key} className={styles.resourcePill} data-resource={key}>
              <span>{key}</span>
              <strong>{formatNumber(value)}</strong>
            </div>
          ))}
        </header>

        {contextValue.notice ? (
          <div className={styles.notice} role="status">
            <span>{contextValue.notice}</span>
            <button type="button" onClick={contextValue.clearNotice}>
              Dismiss
            </button>
          </div>
        ) : null}

        <main className={styles.content}>
          <Outlet context={contextValue} />
        </main>

        <nav className={styles.mobileNav}>
          <NavLink to="/app/dashboard" className={({ isActive }) => (isActive ? styles.mobileNavLinkActive : styles.mobileNavLink)}>
            City
          </NavLink>
          <NavLink to="/app/map" className={({ isActive }) => (isActive ? styles.mobileNavLinkActive : styles.mobileNavLink)}>
            Map
          </NavLink>
          <NavLink to="/app/reports" className={({ isActive }) => (isActive ? styles.mobileNavLinkActive : styles.mobileNavLink)}>
            Reports
          </NavLink>
          <NavLink to="/app/alliance" className={({ isActive }) => (isActive ? styles.mobileNavLinkActive : styles.mobileNavLink)}>
            Alliance
          </NavLink>
        </nav>
      </div>
    </div>
  );
}

export function useGameLayoutContext() {
  return useOutletContext<GameLayoutContext>();
}
