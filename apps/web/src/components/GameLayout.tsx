import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BuildingType, GameStateResponse, WorldMapResponse } from "@frontier/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import { api, ApiClientError } from "../api";
import { formatNumber } from "../lib/formatters";
import styles from "./GameLayout.module.css";

export interface GameLayoutContext {
  state: GameStateResponse;
  selectedCityId: string | null;
  setSelectedCityId: (cityId: string | null) => void;
  attack: (targetCityId: string) => Promise<void>;
  upgrade: (buildingType: BuildingType) => Promise<void>;
  isAttacking: boolean;
  isUpgrading: boolean;
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

        if (payload.type === "city.updated" || payload.type === "upgrade.completed") {
          queryClient.invalidateQueries({ queryKey: ["game-state"] });
        }

        if (payload.type === "report.created") {
          queryClient.invalidateQueries({ queryKey: ["battle-reports"] });
        }

        if (payload.type === "map.updated") {
          queryClient.invalidateQueries({ queryKey: ["world-map"] });
        }

        if (payload.type === "upgrade.completed") {
          onNotice("An upgrade completed in your city.");
        }
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
      setNotice("Upgrade order accepted by the city council.");
    },
  });

  const attackMutation = useMutation({
    mutationFn: (targetCityId: string) => api.attack(targetCityId),
    onSuccess: async ({ report }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
        queryClient.invalidateQueries({ queryKey: ["world-map"] }),
        queryClient.invalidateQueries({ queryKey: ["battle-reports"] }),
      ]);
      setNotice(
        report.result === "ATTACKER_WIN"
          ? `Raid succeeded against ${report.defenderCityName}.`
          : `Raid on ${report.defenderCityName} was repelled.`,
      );
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
      attack: async (targetCityId: string) => {
        await attackMutation.mutateAsync(targetCityId);
      },
      upgrade: async (buildingType: BuildingType) => {
        await upgradeMutation.mutateAsync(buildingType);
      },
      isAttacking: attackMutation.isPending,
      isUpgrading: upgradeMutation.isPending,
      notice,
      clearNotice: () => setNotice(null),
    };
  }, [attackMutation, notice, selectedCityId, stateQuery.data, upgradeMutation]);

  useEffect(() => {
    if (!stateQuery.data) {
      return;
    }

    window.render_game_to_text = () => {
      const worldMap = queryClient.getQueryData<WorldMapResponse>(["world-map"]);
      const selectedCity =
        worldMap?.cities.find((city) => city.cityId === selectedCityId) ?? null;

      return JSON.stringify({
        screen: location.pathname,
        city: {
          name: stateQuery.data.city.cityName,
          coordinates: stateQuery.data.city.coordinates,
          resources: stateQuery.data.city.resources,
          activeUpgrade: stateQuery.data.city.activeUpgrade,
        },
        selectedCity,
        map: {
          loaded: Boolean(worldMap),
          cities:
            worldMap?.cities.map((city) => ({
              cityId: city.cityId,
              ownerName: city.ownerName,
              x: city.x,
              y: city.y,
              canAttack: city.canAttack,
              isCurrentPlayer: city.isCurrentPlayer,
              attackPower: city.attackPower,
              defensePower: city.defensePower,
              projectedOutcome: city.projectedOutcome,
            })) ?? [],
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
        queryClient.invalidateQueries({ queryKey: ["world-map"] });
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
        </nav>

        <button className={styles.logoutButton} type="button" onClick={() => logoutMutation.mutate()}>
          Log out
        </button>
      </aside>

      <div className={styles.main}>
        <header className={styles.resourceBar}>
          {Object.entries(contextValue.state.city.resources).map(([key, value]) => (
            <div key={key} className={styles.resourcePill}>
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
      </div>
    </div>
  );
}

export function useGameLayoutContext() {
  return useOutletContext<GameLayoutContext>();
}
