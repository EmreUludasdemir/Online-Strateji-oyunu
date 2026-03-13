import type { FogTileView, MapCity, MarchView, PoiResourceType, PoiView } from "@frontier/shared";
import Phaser from "phaser";
import { type MutableRefObject, useEffect, useRef, useState } from "react";

import styles from "./WorldMap.module.css";
import {
  MAP_CAMERA_DEFAULT_ZOOM,
  MAP_CAMERA_MAX_ZOOM,
  MAP_CAMERA_MIN_ZOOM,
  MAP_TILE_WORLD_SIZE,
  type MapCameraState,
  type MapDetailLevel,
  type ScoutTrailView,
  getMapDetailLevel,
  tileToWorld,
  worldToTile,
} from "./worldMapShared";

const poiResourceLabels: Record<PoiResourceType, string> = {
  WOOD: "Wood",
  STONE: "Stone",
  FOOD: "Food",
  GOLD: "Gold",
};

type MapFilter = "ALL" | "CITIES" | "CAMPS" | "NODES";
type AnimatedMarchPhase = "moving" | "staging" | "gathering" | "returning";

interface WorldMapProps {
  worldSize: number;
  initialCenter: {
    x: number;
    y: number;
  };
  tiles: FogTileView[];
  cities: MapCity[];
  pois: PoiView[];
  marches: MarchView[];
  scoutTrails: ScoutTrailView[];
  filter: MapFilter;
  selectedCityId: string | null;
  selectedPoiId: string | null;
  selectedMarchId: string | null;
  onSelectCity: (cityId: string) => void;
  onSelectPoi: (poiId: string) => void;
  onSelectMarch: (marchId: string) => void;
  onCameraChange: (state: MapCameraState) => void;
  commandHandleRef?: MutableRefObject<WorldMapHandle | null>;
}

export interface WorldMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  focusCity: (cityId: string) => void;
  focusPoi: (poiId: string) => void;
  focusMarch: (marchId: string) => void;
  focusTile: (x: number, y: number) => void;
}

interface PointLookup<T> {
  worldX: number;
  worldY: number;
  data: T;
}

interface AnimatedMarchEntity {
  marchId: string;
  container: Phaser.GameObjects.Container;
  compactToken: Phaser.GameObjects.Arc;
  shadow: Phaser.GameObjects.Ellipse;
  troopLead: Phaser.GameObjects.Ellipse;
  troopSupport: Phaser.GameObjects.Ellipse;
  bannerPole: Phaser.GameObjects.Rectangle;
  bannerPennant: Phaser.GameObjects.Triangle;
  stagingRing: Phaser.GameObjects.Arc;
  gatherSpinner: Phaser.GameObjects.Arc;
  lastPhase: AnimatedMarchPhase;
  lastTrailAt: number;
}

interface ScoutTrailEntity {
  trailId: string;
  container: Phaser.GameObjects.Container;
  routeGraphic: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Arc;
  pennant: Phaser.GameObjects.Triangle;
  from: {
    x: number;
    y: number;
  };
  to: {
    x: number;
    y: number;
  };
  startedAtMs: number;
  durationMs: number;
  arrived: boolean;
  lastTrailAt: number;
}

interface DragState {
  active: boolean;
  dragging: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

interface SceneConfig {
  worldSize: number;
  initialCenter: {
    x: number;
    y: number;
  };
  tiles: FogTileView[];
  cities: MapCity[];
  pois: PoiView[];
  marches: MarchView[];
  scoutTrails: ScoutTrailView[];
  filter: MapFilter;
  selectedCityId: string | null;
  selectedPoiId: string | null;
  selectedMarchId: string | null;
  onSelectCity: (cityId: string) => void;
  onSelectPoi: (poiId: string) => void;
  onSelectMarch: (marchId: string) => void;
  onCameraChange: (state: MapCameraState) => void;
}

function hashCoordinate(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function getTerrainFill(tile: FogTileView): number {
  const hash = hashCoordinate(tile.x, tile.y) % 4;
  if (tile.state === "HIDDEN") {
    return [0x071016, 0x09121a, 0x08131d, 0x061018][hash];
  }
  if (tile.state === "DISCOVERED") {
    return [0x26312d, 0x2b372f, 0x2c3a33, 0x303a31][hash];
  }
  return [0x304b42, 0x355146, 0x38574b, 0x2d493f][hash];
}

function getMarchColor(objective: MarchView["objective"]): number {
  if (objective === "RESOURCE_GATHER") {
    return 0x63b5b2;
  }
  if (objective === "BARBARIAN_ATTACK") {
    return 0xd66c43;
  }
  return 0xe0bf74;
}

function getAnimatedPhase(march: MarchView): AnimatedMarchPhase {
  if (march.state === "STAGING") {
    return "staging";
  }
  if (march.state === "GATHERING") {
    return "gathering";
  }
  if (march.state === "RETURNING") {
    return "returning";
  }
  return "moving";
}

function interpolate(from: { x: number; y: number }, to: { x: number; y: number }, progress: number) {
  return {
    x: Phaser.Math.Linear(from.x, to.x, progress),
    y: Phaser.Math.Linear(from.y, to.y, progress),
  };
}

class FrontierMapScene extends Phaser.Scene {
  private worldSize = 64;
  private worldPixelSize = this.worldSize * MAP_TILE_WORLD_SIZE;
  private initialCenter = { x: 32, y: 32 };
  private tiles: FogTileView[] = [];
  private cities: MapCity[] = [];
  private pois: PoiView[] = [];
  private marches: MarchView[] = [];
  private scoutTrails: ScoutTrailView[] = [];
  private filter: MapFilter = "ALL";
  private selectedCityId: string | null = null;
  private selectedPoiId: string | null = null;
  private selectedMarchId: string | null = null;
  private onSelectCity: (cityId: string) => void = () => undefined;
  private onSelectPoi: (poiId: string) => void = () => undefined;
  private onSelectMarch: (marchId: string) => void = () => undefined;
  private onCameraChange: (state: MapCameraState) => void = () => undefined;

  private terrainLayer?: Phaser.GameObjects.Layer;
  private objectLayer?: Phaser.GameObjects.Layer;
  private routeLayer?: Phaser.GameObjects.Layer;
  private unitLayer?: Phaser.GameObjects.Layer;
  private fxLayer?: Phaser.GameObjects.Layer;
  private uiLayer?: Phaser.GameObjects.Layer;

  private terrainGraphics?: Phaser.GameObjects.Graphics;
  private gridGraphics?: Phaser.GameObjects.Graphics;
  private routeGraphics?: Phaser.GameObjects.Graphics;

  private cityLookup = new Map<string, PointLookup<MapCity>>();
  private poiLookup = new Map<string, PointLookup<PoiView>>();
  private marchEntities = new Map<string, AnimatedMarchEntity>();
  private scoutEntities = new Map<string, ScoutTrailEntity>();
  private selectionObjects: Phaser.GameObjects.GameObject[] = [];
  private lastCameraState: MapCameraState | null = null;
  private currentDetailLevel: MapDetailLevel = getMapDetailLevel(MAP_CAMERA_DEFAULT_ZOOM);
  private didInitialFocus = false;
  private dragState: DragState = {
    active: false,
    dragging: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  };

  constructor() {
    super("frontier-map");
  }

  create() {
    this.cameras.main.setBackgroundColor("#081319");
    this.terrainLayer = this.add.layer();
    this.objectLayer = this.add.layer();
    this.routeLayer = this.add.layer();
    this.unitLayer = this.add.layer();
    this.fxLayer = this.add.layer();
    this.uiLayer = this.add.layer();

    this.terrainGraphics = this.add.graphics();
    this.gridGraphics = this.add.graphics();
    this.routeGraphics = this.add.graphics();

    this.terrainLayer.add([this.terrainGraphics, this.gridGraphics]);
    this.routeLayer.add(this.routeGraphics);

    this.applyWorldBounds();
    this.bindInput();
    this.syncTerrainLayer();
    this.syncObjectLayer();
    this.syncSelectionFx();
    this.syncMarchEntities();
    this.syncScoutTrails();
    this.emitCameraState(true);
  }

  update() {
    if (!this.sys.isActive()) {
      return;
    }

    const nextDetail = getMapDetailLevel(this.cameras.main.zoom);
    if (nextDetail !== this.currentDetailLevel) {
      this.currentDetailLevel = nextDetail;
      this.syncTerrainLayer();
      this.syncObjectLayer();
      this.syncSelectionFx();
    }

    this.updateRouteLayer();
    this.updateMarchEntities();
    this.updateScoutTrails();
    this.updateSelectionFxPosition();
    this.emitCameraState();
  }

  configure(config: SceneConfig) {
    const worldSizeChanged = this.worldSize !== config.worldSize;

    this.worldSize = config.worldSize;
    this.worldPixelSize = this.worldSize * MAP_TILE_WORLD_SIZE;
    this.initialCenter = config.initialCenter;
    this.tiles = config.tiles;
    this.cities = config.cities;
    this.pois = config.pois;
    this.marches = config.marches;
    this.scoutTrails = config.scoutTrails;
    this.filter = config.filter;
    this.selectedCityId = config.selectedCityId;
    this.selectedPoiId = config.selectedPoiId;
    this.selectedMarchId = config.selectedMarchId;
    this.onSelectCity = config.onSelectCity;
    this.onSelectPoi = config.onSelectPoi;
    this.onSelectMarch = config.onSelectMarch;
    this.onCameraChange = config.onCameraChange;

    if (!this.sys.isActive()) {
      return;
    }

    if (worldSizeChanged) {
      this.applyWorldBounds();
    }

    if (!this.didInitialFocus) {
      this.focusTile(config.initialCenter.x, config.initialCenter.y, 0);
      this.didInitialFocus = true;
    }

    this.syncTerrainLayer();
    this.syncObjectLayer();
    this.syncSelectionFx();
    this.syncMarchEntities();
    this.syncScoutTrails();
    this.emitCameraState(true);
  }

  resizeViewport() {
    if (!this.isCameraReady()) {
      return;
    }
    this.emitCameraState(true);
  }

  zoomIn() {
    if (!this.isCameraReady()) {
      return;
    }
    this.zoomAroundViewportCenter(this.cameras.main.zoom + 0.18);
  }

  zoomOut() {
    if (!this.isCameraReady()) {
      return;
    }
    this.zoomAroundViewportCenter(this.cameras.main.zoom - 0.18);
  }

  focusCity(cityId: string) {
    const city = this.cities.find((entry) => entry.cityId === cityId);
    if (city) {
      this.focusTile(city.x, city.y);
    }
  }

  focusPoi(poiId: string) {
    const poi = this.pois.find((entry) => entry.id === poiId);
    if (poi) {
      this.focusTile(poi.x, poi.y);
    }
  }

  focusMarch(marchId: string) {
    const entity = this.marchEntities.get(marchId);
    if (entity) {
      const tile = worldToTile(entity.container.x, entity.container.y, this.worldSize);
      this.focusTile(tile.x, tile.y);
      return;
    }

    const march = this.marches.find((entry) => entry.id === marchId);
    if (march) {
      this.focusTile(march.target.x, march.target.y);
    }
  }

  focusTile(x: number, y: number, duration = 360) {
    if (!this.isCameraReady()) {
      return;
    }
    const point = tileToWorld(x, y);
    this.cameras.main.pan(point.x, point.y, duration, "Cubic.easeOut", true);
  }

  private applyWorldBounds() {
    if (!this.isCameraReady()) {
      return;
    }
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.worldPixelSize, this.worldPixelSize);
    camera.setZoom(Phaser.Math.Clamp(camera.zoom || MAP_CAMERA_DEFAULT_ZOOM, MAP_CAMERA_MIN_ZOOM, MAP_CAMERA_MAX_ZOOM));
  }

  private bindInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) {
        return;
      }

      this.dragState = {
        active: true,
        dragging: false,
        startX: pointer.x,
        startY: pointer.y,
        lastX: pointer.x,
        lastY: pointer.y,
      };
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragState.active || !pointer.isDown) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        this.dragState.startX,
        this.dragState.startY,
        pointer.x,
        pointer.y,
      );

      if (distance > 8) {
        this.dragState.dragging = true;
      }

      if (!this.dragState.dragging) {
        return;
      }

      const dx = pointer.x - this.dragState.lastX;
      const dy = pointer.y - this.dragState.lastY;
      const camera = this.cameras.main;
      camera.scrollX -= dx / camera.zoom;
      camera.scrollY -= dy / camera.zoom;
      this.dragState.lastX = pointer.x;
      this.dragState.lastY = pointer.y;
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragState.active) {
        return;
      }

      const wasDragging = this.dragState.dragging;
      this.dragState.active = false;
      this.dragState.dragging = false;

      if (wasDragging) {
        this.emitCameraState(true);
        return;
      }

      this.handlePointerSelect(pointer);
    });

    this.input.on("pointerupoutside", () => {
      this.dragState.active = false;
      this.dragState.dragging = false;
    });

    this.input.on("wheel", (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      this.zoomAroundScreenPoint(pointer.x, pointer.y, this.cameras.main.zoom - dy * 0.001);
    });
  }

  private zoomAroundViewportCenter(nextZoom: number) {
    if (!this.isCameraReady()) {
      return;
    }
    this.zoomAroundScreenPoint(this.scale.width * 0.5, this.scale.height * 0.5, nextZoom);
  }

  private zoomAroundScreenPoint(screenX: number, screenY: number, nextZoom: number) {
    if (!this.isCameraReady()) {
      return;
    }
    const camera = this.cameras.main;
    const clampedZoom = Phaser.Math.Clamp(nextZoom, MAP_CAMERA_MIN_ZOOM, MAP_CAMERA_MAX_ZOOM);
    const worldBefore = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(clampedZoom);
    const worldAfter = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += worldBefore.x - worldAfter.x;
    camera.scrollY += worldBefore.y - worldAfter.y;
    this.emitCameraState(true);
  }

  private clearLayer(layer?: Phaser.GameObjects.Layer) {
    if (!layer) {
      return;
    }
    layer.removeAll(true);
  }

  private syncTerrainLayer() {
    if (!this.terrainGraphics || !this.gridGraphics) {
      return;
    }

    this.terrainGraphics.clear();
    this.gridGraphics.clear();
    this.terrainGraphics.fillStyle(0x071319, 1);
    this.terrainGraphics.fillRect(0, 0, this.worldPixelSize, this.worldPixelSize);

    for (const tile of this.tiles) {
      const x = tile.x * MAP_TILE_WORLD_SIZE;
      const y = tile.y * MAP_TILE_WORLD_SIZE;
      this.terrainGraphics.fillStyle(getTerrainFill(tile), tile.state === "VISIBLE" ? 0.96 : tile.state === "DISCOVERED" ? 0.92 : 1);
      this.terrainGraphics.fillRect(x, y, MAP_TILE_WORLD_SIZE, MAP_TILE_WORLD_SIZE);

      const decoration = hashCoordinate(tile.x, tile.y) % 5;
      if (tile.state !== "HIDDEN" && decoration <= 2) {
        this.terrainGraphics.fillStyle(tile.state === "VISIBLE" ? 0x4b6c5f : 0x3b4a43, 0.11);
        this.terrainGraphics.fillCircle(x + 28 + decoration * 10, y + 26 + decoration * 8, 8 + decoration * 2);
      }
    }

    if (this.currentDetailLevel === "near") {
      this.gridGraphics.lineStyle(1, 0xf6e7c3, 0.08);
      for (const tile of this.tiles) {
        const x = tile.x * MAP_TILE_WORLD_SIZE;
        const y = tile.y * MAP_TILE_WORLD_SIZE;
        this.gridGraphics.strokeRect(x, y, MAP_TILE_WORLD_SIZE, MAP_TILE_WORLD_SIZE);
      }
    }
  }

  private syncObjectLayer() {
    this.clearLayer(this.objectLayer);
    this.clearLayer(this.uiLayer);
    this.cityLookup.clear();
    this.poiLookup.clear();

    if (!this.objectLayer || !this.uiLayer) {
      return;
    }

    const showLabels = this.currentDetailLevel !== "far";
    const showNearDetail = this.currentDetailLevel === "near";

    for (const poi of this.pois) {
      const isFilteredOut =
        this.filter !== "ALL" &&
        !(
          (this.filter === "CAMPS" && poi.kind === "BARBARIAN_CAMP") ||
          (this.filter === "NODES" && poi.kind === "RESOURCE_NODE")
        ) &&
        poi.id !== this.selectedPoiId;

      if (isFilteredOut) {
        continue;
      }

      const point = tileToWorld(poi.x, poi.y);
      this.poiLookup.set(poi.id, { worldX: point.x, worldY: point.y, data: poi });

      const selected = poi.id === this.selectedPoiId;
      const baseColor =
        poi.kind === "BARBARIAN_CAMP"
          ? 0xc7643e
          : poi.resourceType === "WOOD"
            ? 0x7bb17b
            : poi.resourceType === "STONE"
              ? 0xa8adb3
              : poi.resourceType === "FOOD"
                ? 0xc7ba72
                : 0xe1b55c;

      const aura = this.add.circle(point.x, point.y, 34, baseColor, poi.state === "ACTIVE" ? 0.14 : 0.08);
      this.objectLayer.add(aura);
      this.addAmbientPulse(aura, {
        minScale: 0.96,
        maxScale: poi.kind === "BARBARIAN_CAMP" ? 1.18 : 1.1,
        minAlpha: poi.state === "ACTIVE" ? 0.08 : 0.04,
        maxAlpha: poi.state === "ACTIVE" ? 0.2 : 0.1,
        duration: 1800 + (hashCoordinate(poi.x, poi.y) % 5) * 220,
      });

      if (poi.kind === "BARBARIAN_CAMP") {
        const fortOuter = this.add.rectangle(point.x, point.y, 44, 44, baseColor, poi.state === "ACTIVE" ? 0.95 : 0.55).setAngle(45);
        const fortInner = this.add.rectangle(point.x, point.y, 18, 18, 0x2a130e, 0.78).setAngle(45);
        fortOuter.setStrokeStyle(selected ? 4 : 2, selected ? 0xf4d79c : 0xf7edd9, 0.95);
        this.objectLayer.add([fortOuter, fortInner]);
        this.addAmbientPulse(fortOuter, {
          minScale: 0.98,
          maxScale: selected ? 1.09 : 1.04,
          minAlpha: poi.state === "ACTIVE" ? 0.74 : 0.42,
          maxAlpha: poi.state === "ACTIVE" ? 0.96 : 0.62,
          duration: 2000 + (hashCoordinate(poi.x + 7, poi.y) % 5) * 180,
        });
      } else {
        const marker = this.add.circle(point.x, point.y, 18, baseColor, poi.state === "ACTIVE" ? 0.96 : 0.62);
        const core = this.add.circle(point.x, point.y, 8, 0x1b100b, 0.65);
        marker.setStrokeStyle(selected ? 4 : 2, selected ? 0xf4d79c : 0xf7edd9, 0.95);
        this.objectLayer.add([marker, core]);
        this.addAmbientPulse(marker, {
          minScale: 0.98,
          maxScale: selected ? 1.08 : 1.04,
          minAlpha: poi.state === "ACTIVE" ? 0.8 : 0.45,
          maxAlpha: poi.state === "ACTIVE" ? 0.98 : 0.66,
          duration: 1700 + (hashCoordinate(poi.x, poi.y + 9) % 5) * 200,
        });
      }

      if (showLabels) {
        const lineTwo =
          showNearDetail && poi.kind === "RESOURCE_NODE" && poi.remainingAmount != null
            ? `${poiResourceLabels[poi.resourceType ?? "WOOD"]} ${poi.remainingAmount}`
            : poi.kind === "BARBARIAN_CAMP"
              ? `Camp L${poi.level}`
              : `${poiResourceLabels[poi.resourceType ?? "WOOD"]} L${poi.level}`;

        const label = this.add
          .text(point.x, point.y + 26, `${poi.label}\n${lineTwo}`, {
            color: "#f8f0dd",
            fontFamily: "'Cinzel', 'Palatino Linotype', serif",
            fontSize: showNearDetail ? "13px" : "11px",
            align: "center",
            backgroundColor: "rgba(20, 13, 11, 0.5)",
            padding: { x: 6, y: 4 },
          })
          .setOrigin(0.5, 0);
        this.uiLayer.add(label);
        this.addLabelFloat(label, point.y + 26, hashCoordinate(poi.x, poi.y));
      }
    }

    for (const city of this.cities) {
      if (this.filter === "CAMPS" || this.filter === "NODES") {
        if (city.cityId !== this.selectedCityId) {
          continue;
        }
      }

      const point = tileToWorld(city.x, city.y);
      this.cityLookup.set(city.cityId, { worldX: point.x, worldY: point.y, data: city });
      const selected = city.cityId === this.selectedCityId;
      const auraColor = city.isCurrentPlayer ? 0x4fb3b6 : city.fogState === "VISIBLE" ? 0xa54842 : 0x8d6a46;
      const cityColor = city.isCurrentPlayer ? 0x458b8e : city.fogState === "VISIBLE" ? 0xc46f49 : 0x9b7651;

      const aura = this.add.circle(point.x, point.y, 38, auraColor, city.isCurrentPlayer ? 0.18 : 0.12);
      const marker = this.add.circle(point.x, point.y, 20, cityColor, 0.98);
      const core = this.add.rectangle(point.x, point.y, 12, 12, 0x1b100b, 0.72).setAngle(45);
      marker.setStrokeStyle(selected ? 4 : 2, selected ? 0xf4d79c : 0xf7edd9, 0.95);

      this.objectLayer.add([aura, marker, core]);
      this.addAmbientPulse(aura, {
        minScale: 0.96,
        maxScale: city.isCurrentPlayer ? 1.2 : 1.12,
        minAlpha: city.isCurrentPlayer ? 0.1 : 0.06,
        maxAlpha: city.isCurrentPlayer ? 0.22 : 0.16,
        duration: 2100 + (hashCoordinate(city.x, city.y) % 5) * 180,
      });
      this.addAmbientPulse(marker, {
        minScale: 0.99,
        maxScale: selected ? 1.08 : 1.04,
        minAlpha: 0.84,
        maxAlpha: 1,
        duration: 1700 + (hashCoordinate(city.x + 11, city.y) % 5) * 160,
      });

      if (showLabels) {
        const label = this.add
          .text(point.x, point.y - 30, city.isCurrentPlayer ? "You" : city.cityName, {
            color: "#f8f0dd",
            fontFamily: "'Cinzel', 'Palatino Linotype', serif",
            fontSize: showNearDetail ? "14px" : "11px",
            align: "center",
            backgroundColor: "rgba(20, 13, 11, 0.5)",
            padding: { x: 6, y: 3 },
          })
          .setOrigin(0.5, 1);
        this.uiLayer.add(label);
        this.addLabelFloat(label, point.y - 30, hashCoordinate(city.x, city.y));

        if (showNearDetail && city.stagedMarchCount > 0) {
          const staging = this.add
            .text(point.x, point.y + 26, `${city.stagedMarchCount} staged`, {
              color: "#f4d79c",
              fontFamily: "'Inter', sans-serif",
              fontSize: "11px",
              backgroundColor: "rgba(39, 19, 12, 0.65)",
              padding: { x: 5, y: 3 },
            })
            .setOrigin(0.5, 0);
          this.uiLayer.add(staging);
        }

        if (showNearDetail && selected && city.projectedOutcome) {
          const outcome = this.add
            .text(point.x, point.y + 48, city.projectedOutcome === "ATTACKER_WIN" ? "Projected win" : "Projected hold", {
              color: city.projectedOutcome === "ATTACKER_WIN" ? "#85d0a1" : "#f0b19a",
              fontFamily: "'Inter', sans-serif",
              fontSize: "11px",
              backgroundColor: "rgba(24, 12, 9, 0.7)",
              padding: { x: 5, y: 3 },
            })
            .setOrigin(0.5, 0);
          this.uiLayer.add(outcome);
        }
      }
    }
  }

  private syncSelectionFx() {
    for (const object of this.selectionObjects) {
      object.destroy();
    }
    this.selectionObjects = [];

    if (!this.fxLayer) {
      return;
    }

    const selection = this.getSelectionPoint();
    if (!selection) {
      return;
    }

    const outer = this.add.circle(selection.x, selection.y, this.selectedMarchId ? 28 : 32, 0x000000, 0);
    outer.setStrokeStyle(3, 0xf4d79c, 0.92);
    const inner = this.add.circle(selection.x, selection.y, this.selectedMarchId ? 18 : 22, 0x000000, 0);
    inner.setStrokeStyle(1, this.selectedMarchId ? 0x7dd3fc : 0x72ced1, 0.55);

    this.fxLayer.add([outer, inner]);
    this.selectionObjects.push(outer, inner);

    this.tweens.add({
      targets: outer,
      scale: { from: 0.94, to: 1.08 },
      alpha: { from: 0.9, to: 0.6 },
      duration: 1100,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: inner,
      scale: { from: 0.98, to: 1.16 },
      alpha: { from: 0.45, to: 0.22 },
      duration: 900,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private updateSelectionFxPosition() {
    if (this.selectionObjects.length === 0) {
      return;
    }

    const selection = this.getSelectionPoint();
    if (!selection) {
      return;
    }

    for (const object of this.selectionObjects) {
      const shape = object as Phaser.GameObjects.Shape;
      shape.setPosition(selection.x, selection.y);
    }
  }

  private getSelectionPoint() {
    if (this.selectedMarchId) {
      const entity = this.marchEntities.get(this.selectedMarchId);
      if (entity) {
        return {
          x: entity.container.x,
          y: entity.container.y,
        };
      }
    }

    const selection = this.selectedCityId
      ? this.cityLookup.get(this.selectedCityId)
      : this.selectedPoiId
        ? this.poiLookup.get(this.selectedPoiId)
        : null;

    return selection
      ? {
          x: selection.worldX,
          y: selection.worldY,
        }
      : null;
  }

  private syncMarchEntities() {
    if (!this.unitLayer) {
      return;
    }

    const nextIds = new Set(this.marches.map((march) => march.id));
    for (const [marchId, entity] of this.marchEntities) {
      if (!nextIds.has(marchId)) {
        this.spawnPulse(entity.container.x, entity.container.y, 0xf1c56d, 22);
        entity.container.destroy(true);
        this.marchEntities.delete(marchId);
      }
    }

    for (const march of this.marches) {
      if (this.marchEntities.has(march.id)) {
        continue;
      }

      const color = getMarchColor(march.objective);
      const shadow = this.add.ellipse(0, 14, 34, 14, 0x000000, 0.26);
      const troopLead = this.add.ellipse(-10, 2, 11, 11, 0xf6e0b8, 0.98);
      const troopSupport = this.add.ellipse(7, 4, 9, 9, 0xe8d1a3, 0.94);
      const bannerPole = this.add.rectangle(4, -8, 3, 24, 0x23120d, 0.9);
      const bannerPennant = this.add.triangle(10, -12, 0, 0, 18, 8, 0, 16, color, 0.98);
      const compactToken = this.add.circle(0, 0, 12, color, 0.98);
      const stagingRing = this.add.circle(0, 0, 28, 0x000000, 0);
      stagingRing.setStrokeStyle(2, color, 0.6);
      const gatherSpinner = this.add.arc(0, 0, 30, 0, 220, false, color, 0);
      gatherSpinner.setStrokeStyle(3, color, 0.86);
      const container = this.add.container(0, 0, [
        shadow,
        troopLead,
        troopSupport,
        bannerPole,
        bannerPennant,
        compactToken,
        stagingRing,
        gatherSpinner,
      ]);

      this.unitLayer.add(container);

      const entity: AnimatedMarchEntity = {
        marchId: march.id,
        container,
        compactToken,
        shadow,
        troopLead,
        troopSupport,
        bannerPole,
        bannerPennant,
        stagingRing,
        gatherSpinner,
        lastPhase: getAnimatedPhase(march),
        lastTrailAt: 0,
      };
      this.marchEntities.set(march.id, entity);

      const origin = tileToWorld(march.origin.x, march.origin.y);
      container.setPosition(origin.x, origin.y);
      this.spawnPulse(origin.x, origin.y, color, 20);
    }

    this.updateMarchEntities();
  }

  private syncScoutTrails() {
    const nextIds = new Set(this.scoutTrails.map((trail) => trail.id));

    for (const [trailId, entity] of this.scoutEntities) {
      if (!nextIds.has(trailId)) {
        entity.routeGraphic.destroy();
        entity.container.destroy(true);
        this.scoutEntities.delete(trailId);
      }
    }

    if (!this.unitLayer || !this.routeLayer) {
      return;
    }

    for (const trail of this.scoutTrails) {
      if (this.scoutEntities.has(trail.id)) {
        continue;
      }

      const from = tileToWorld(trail.from.x, trail.from.y);
      const to = tileToWorld(trail.to.x, trail.to.y);
      const routeGraphic = this.add.graphics();
      routeGraphic.lineStyle(2, 0x7dd3fc, 0.48);
      routeGraphic.lineBetween(from.x, from.y, to.x, to.y);
      this.routeLayer.add(routeGraphic);

      const shadow = this.add.ellipse(0, 10, 24, 10, 0x000000, 0.22);
      const body = this.add.circle(0, 0, 8, 0x7dd3fc, 0.98);
      body.setStrokeStyle(2, 0xe4f6ff, 0.82);
      const pennant = this.add.triangle(10, -2, 0, 0, 14, 5, 0, 10, 0xdaf7ff, 0.96);
      const container = this.add.container(from.x, from.y, [shadow, body, pennant]);
      this.unitLayer.add(container);

      this.scoutEntities.set(trail.id, {
        trailId: trail.id,
        container,
        routeGraphic,
        shadow,
        body,
        pennant,
        from,
        to,
        startedAtMs: Date.parse(trail.startedAt),
        durationMs: trail.durationMs,
        arrived: false,
        lastTrailAt: 0,
      });

      this.spawnPulse(from.x, from.y, 0x7dd3fc, 18);
    }
  }

  private updateRouteLayer() {
    if (!this.routeGraphics) {
      return;
    }

    this.routeGraphics.clear();
    const dashOffset = (this.time.now / 36) % 20;

    for (const march of this.marches) {
      const origin = tileToWorld(march.origin.x, march.origin.y);
      const target = tileToWorld(march.target.x, march.target.y);
      const color = getMarchColor(march.objective);
      const highlight =
        march.id === this.selectedMarchId ||
        (march.targetCityId && march.targetCityId === this.selectedCityId) ||
        (march.targetPoiId && march.targetPoiId === this.selectedPoiId);
      const alpha = highlight ? 0.95 : this.currentDetailLevel === "far" ? 0.42 : 0.62;
      this.routeGraphics.lineStyle(this.currentDetailLevel === "far" ? 2 : 3, color, alpha);
      this.drawDashedLine(this.routeGraphics, origin.x, origin.y, target.x, target.y, dashOffset);
      this.routeGraphics.fillStyle(color, highlight ? 0.95 : 0.7);
      this.routeGraphics.fillCircle(target.x, target.y, highlight ? 7 : 5);
    }
  }

  private drawDashedLine(graphics: Phaser.GameObjects.Graphics, fromX: number, fromY: number, toX: number, toY: number, offset: number) {
    const dashLength = this.currentDetailLevel === "far" ? 16 : 22;
    const gapLength = this.currentDetailLevel === "far" ? 12 : 14;
    const totalLength = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    if (totalLength <= 0) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    for (let progress = -offset; progress < totalLength; progress += dashLength + gapLength) {
      const start = Math.max(0, progress);
      const end = Math.min(totalLength, progress + dashLength);
      if (end <= 0 || end <= start) {
        continue;
      }

      const startX = fromX + Math.cos(angle) * start;
      const startY = fromY + Math.sin(angle) * start;
      const endX = fromX + Math.cos(angle) * end;
      const endY = fromY + Math.sin(angle) * end;
      graphics.lineBetween(startX, startY, endX, endY);
    }
  }

  private updateMarchEntities() {
    const nowMs = Date.now();
    const detail = this.currentDetailLevel;

    for (const march of this.marches) {
      const entity = this.marchEntities.get(march.id);
      if (!entity) {
        continue;
      }

      const phase = getAnimatedPhase(march);
      const point = this.getMarchPoint(march, phase, nowMs);
      const destination =
        phase === "returning"
          ? tileToWorld(march.origin.x, march.origin.y)
          : tileToWorld(march.target.x, march.target.y);
      const direction = Phaser.Math.Angle.Between(point.x, point.y, destination.x, destination.y);

      if (entity.lastPhase !== phase && (phase === "staging" || phase === "gathering")) {
        this.spawnPulse(destination.x, destination.y, getMarchColor(march.objective), 20);
      }

      entity.container.setPosition(point.x, point.y);
      entity.container.setRotation(direction + Math.PI / 2);

      const bob = Math.sin(this.time.now / 180 + hashCoordinate(march.origin.x, march.origin.y)) * 1.4;
      entity.troopLead.setY(2 + bob);
      entity.troopSupport.setY(4 - bob * 0.7);
      entity.bannerPennant.setScale(1, 1 + Math.sin(this.time.now / 120 + march.distance) * 0.08);

      const compact = detail === "far";
      entity.compactToken.setVisible(compact);
      entity.shadow.setVisible(!compact);
      entity.troopLead.setVisible(!compact);
      entity.troopSupport.setVisible(!compact);
      entity.bannerPole.setVisible(!compact);
      entity.bannerPennant.setVisible(!compact);

      entity.stagingRing.setVisible(phase === "staging");
      entity.gatherSpinner.setVisible(phase === "gathering");
      if (phase === "staging") {
        entity.stagingRing.setScale(1 + Math.sin(this.time.now / 160) * 0.08);
        entity.stagingRing.setAlpha(0.55 + Math.sin(this.time.now / 180) * 0.2);
      }
      if (phase === "gathering") {
        entity.gatherSpinner.rotation += 0.08;
        entity.gatherSpinner.setAlpha(0.86);
      }
      if ((phase === "moving" || phase === "returning") && this.time.now - entity.lastTrailAt > 130) {
        entity.lastTrailAt = this.time.now;
        this.spawnTrailDust(point.x, point.y, getMarchColor(march.objective), direction + Math.PI);
      }

      entity.lastPhase = phase;
    }
  }

  private updateScoutTrails() {
    const nowMs = Date.now();

    for (const entity of this.scoutEntities.values()) {
      const progress = Phaser.Math.Clamp((nowMs - entity.startedAtMs) / entity.durationMs, 0, 1);
      const easedProgress = Phaser.Math.Easing.Sine.InOut(progress);
      const point = interpolate(entity.from, entity.to, easedProgress);
      const direction = Phaser.Math.Angle.Between(point.x, point.y, entity.to.x, entity.to.y);

      entity.container.setPosition(point.x, point.y);
      entity.container.setRotation(direction + Math.PI / 2);
      entity.shadow.setScale(1 + Math.sin(this.time.now / 180) * 0.08);
      entity.pennant.setScale(1, 1 + Math.sin(this.time.now / 140) * 0.1);

      if (this.currentDetailLevel === "far") {
        entity.container.setScale(0.82);
      } else if (this.currentDetailLevel === "near") {
        entity.container.setScale(1.05);
      } else {
        entity.container.setScale(0.94);
      }

      if (progress >= 1 && !entity.arrived) {
        entity.arrived = true;
        this.spawnPulse(entity.to.x, entity.to.y, 0xfacc15, 16);
      }

      if (progress < 1 && this.time.now - entity.lastTrailAt > 120) {
        entity.lastTrailAt = this.time.now;
        this.spawnTrailDust(point.x, point.y, 0x7dd3fc, direction + Math.PI, 0.55);
      }
    }
  }

  private getMarchPoint(march: MarchView, phase: AnimatedMarchPhase, nowMs: number) {
    const origin = tileToWorld(march.origin.x, march.origin.y);
    const target = tileToWorld(march.target.x, march.target.y);

    if (phase === "staging" || phase === "gathering") {
      return target;
    }

    if (phase === "returning") {
      const startedAt = Date.parse(march.gatherStartedAt ?? march.etaAt);
      const endsAt = Date.parse(march.returnEtaAt ?? march.etaAt);
      const progress = endsAt <= startedAt ? 1 : Phaser.Math.Clamp((nowMs - startedAt) / (endsAt - startedAt), 0, 1);
      return interpolate(target, origin, progress);
    }

    const startedAt = Date.parse(march.startedAt);
    const endsAt = Date.parse(march.etaAt);
    const progress = endsAt <= startedAt ? 1 : Phaser.Math.Clamp((nowMs - startedAt) / (endsAt - startedAt), 0, 1);
    return interpolate(origin, target, progress);
  }

  private spawnPulse(x: number, y: number, color: number, radius: number) {
    if (!this.fxLayer) {
      return;
    }

    const pulse = this.add.circle(x, y, radius, color, 0);
    pulse.setStrokeStyle(3, color, 0.72);
    this.fxLayer.add(pulse);
    this.tweens.add({
      targets: pulse,
      scale: 2.2,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private spawnTrailDust(x: number, y: number, color: number, angle: number, scale = 0.8) {
    if (!this.fxLayer) {
      return;
    }

    const offsetX = Math.cos(angle) * Phaser.Math.Between(8, 18);
    const offsetY = Math.sin(angle) * Phaser.Math.Between(8, 18);
    const dust = this.add.circle(x + offsetX, y + offsetY, Phaser.Math.FloatBetween(3, 6) * scale, color, 0.3);
    this.fxLayer.add(dust);
    this.tweens.add({
      targets: dust,
      x: dust.x + Math.cos(angle) * Phaser.Math.Between(12, 22),
      y: dust.y + Math.sin(angle) * Phaser.Math.Between(12, 22),
      scale: 1.8,
      alpha: 0,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => dust.destroy(),
    });
  }

  private addAmbientPulse(
    target: Phaser.GameObjects.Shape,
    options: {
      minScale: number;
      maxScale: number;
      minAlpha: number;
      maxAlpha: number;
      duration: number;
    },
  ) {
    target.setScale(options.minScale);
    target.setAlpha(options.maxAlpha);
    this.tweens.add({
      targets: target,
      scale: { from: options.minScale, to: options.maxScale },
      alpha: { from: options.maxAlpha, to: options.minAlpha },
      duration: options.duration,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private addLabelFloat(label: Phaser.GameObjects.Text, baseY: number, hash: number) {
    this.tweens.add({
      targets: label,
      y: { from: baseY, to: baseY - 4 },
      alpha: { from: 0.92, to: 1 },
      duration: 1800 + (hash % 6) * 150,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private emitCameraState(force = false) {
    if (!this.isCameraReady()) {
      return;
    }
    const camera = this.cameras.main;
    const centerWorldX = camera.scrollX + this.scale.width / (2 * camera.zoom);
    const centerWorldY = camera.scrollY + this.scale.height / (2 * camera.zoom);
    const centerTile = worldToTile(centerWorldX, centerWorldY, this.worldSize);
    const nextState: MapCameraState = {
      centerTileX: centerTile.x,
      centerTileY: centerTile.y,
      zoom: Number(camera.zoom.toFixed(2)),
      detailLevel: this.currentDetailLevel,
    };

    if (
      !force &&
      this.lastCameraState &&
      this.lastCameraState.centerTileX === nextState.centerTileX &&
      this.lastCameraState.centerTileY === nextState.centerTileY &&
      this.lastCameraState.detailLevel === nextState.detailLevel &&
      Math.abs(this.lastCameraState.zoom - nextState.zoom) < 0.02
    ) {
      return;
    }

    this.lastCameraState = nextState;
    this.onCameraChange(nextState);
  }

  private handlePointerSelect(pointer: Phaser.Input.Pointer) {
    if (!this.isCameraReady()) {
      return;
    }
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const marchId = this.findNearestMarch(worldPoint.x, worldPoint.y);
    if (marchId) {
      this.onSelectMarch(marchId);
      return;
    }

    const poi = this.findNearestPoi(worldPoint.x, worldPoint.y);
    if (poi) {
      this.onSelectPoi(poi.data.id);
      return;
    }

    const city = this.findNearestCity(worldPoint.x, worldPoint.y);
    if (city) {
      this.onSelectCity(city.data.cityId);
    }
  }

  private findNearestMarch(worldX: number, worldY: number) {
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entity of this.marchEntities.values()) {
      const threshold = this.currentDetailLevel === "far" ? 20 : 32;
      const distance = Phaser.Math.Distance.Between(worldX, worldY, entity.container.x, entity.container.y);
      if (distance < threshold && distance < bestDistance) {
        bestId = entity.marchId;
        bestDistance = distance;
      }
    }

    return bestId;
  }

  private findNearestPoi(worldX: number, worldY: number) {
    let best: PointLookup<PoiView> | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const poi of this.poiLookup.values()) {
      const distance = Phaser.Math.Distance.Between(worldX, worldY, poi.worldX, poi.worldY);
      if (distance < 30 && distance < bestDistance) {
        best = poi;
        bestDistance = distance;
      }
    }
    return best;
  }

  private findNearestCity(worldX: number, worldY: number) {
    let best: PointLookup<MapCity> | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const city of this.cityLookup.values()) {
      const distance = Phaser.Math.Distance.Between(worldX, worldY, city.worldX, city.worldY);
      if (distance < 34 && distance < bestDistance) {
        best = city;
        bestDistance = distance;
      }
    }
    return best;
  }

  private isCameraReady() {
    return Boolean(this.sys?.isActive() && this.cameras && this.cameras.main);
  }
}

export default function WorldMap({
  worldSize,
  initialCenter,
  tiles,
  cities,
  pois,
  marches,
  scoutTrails,
  filter,
  selectedCityId,
  selectedPoiId,
  selectedMarchId,
  onSelectCity,
  onSelectPoi,
  onSelectMarch,
  onCameraChange,
  commandHandleRef,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<FrontierMapScene | null>(null);
  const [viewport, setViewport] = useState({ width: 900, height: 560 });

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return undefined;
    }

    const scene = new FrontierMapScene();
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: viewport.width,
      height: viewport.height,
      parent: containerRef.current,
      scene: [scene],
      backgroundColor: "#081319",
      scale: {
        mode: Phaser.Scale.NONE,
      },
    });

    gameRef.current = game;
    sceneRef.current = scene;

    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setViewport({
        width: Math.max(320, Math.floor(width)),
        height: Math.max(420, Math.floor(height)),
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const game = gameRef.current;

    if (!scene || !game) {
      return;
    }

    game.scale.resize(viewport.width, viewport.height);
    if (scene.sys?.isActive()) {
      scene.resizeViewport();
    }
  }, [viewport.height, viewport.width]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    scene.configure({
      worldSize,
      initialCenter,
      tiles,
      cities,
      pois,
      marches,
      scoutTrails,
      filter,
      selectedCityId,
      selectedPoiId,
      selectedMarchId,
      onSelectCity,
      onSelectPoi,
      onSelectMarch,
      onCameraChange,
    });
  }, [
    cities,
    filter,
    initialCenter,
    marches,
    onCameraChange,
    onSelectCity,
    onSelectMarch,
    onSelectPoi,
    pois,
    scoutTrails,
    selectedCityId,
    selectedMarchId,
    selectedPoiId,
    tiles,
    worldSize,
  ]);

  useEffect(() => {
    if (!commandHandleRef) {
      return undefined;
    }

    commandHandleRef.current = {
      zoomIn: () => sceneRef.current?.zoomIn(),
      zoomOut: () => sceneRef.current?.zoomOut(),
      focusCity: (cityId: string) => sceneRef.current?.focusCity(cityId),
      focusPoi: (poiId: string) => sceneRef.current?.focusPoi(poiId),
      focusMarch: (marchId: string) => sceneRef.current?.focusMarch(marchId),
      focusTile: (x: number, y: number) => sceneRef.current?.focusTile(x, y),
    };

    return () => {
      commandHandleRef.current = null;
    };
  }, [commandHandleRef]);

  return <div ref={containerRef} className={styles.mapCanvas} />;
}
