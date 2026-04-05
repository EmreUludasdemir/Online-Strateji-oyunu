import type { AllianceMarkerView, FogTileView, MapCity, MarchView, PoiResourceType, PoiView } from "@frontier/shared";
import { type MutableRefObject, useEffect, useRef, useState } from "react";

import Phaser from "./phaserRuntime";
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
import { getWorldRegions } from "./worldRegions";

const poiResourceLabels: Record<PoiResourceType, string> = {
  WOOD: "Wood",
  STONE: "Stone",
  FOOD: "Food",
  GOLD: "Gold",
};

type MapFilter = "ALL" | "CITIES" | "CAMPS" | "NODES";
type AnimatedMarchPhase = "moving" | "staging" | "gathering" | "returning";

const MAP_COLOR_ALLIED = 0x72ced1;
const MAP_COLOR_HOSTILE = 0xd47b5a;
const MAP_COLOR_NEUTRAL = 0xf4d79c;
const MAP_COLOR_SCOUT = 0x7dd3fc;
const MAP_COLOR_GATHER = 0x63b5b2;
const MAP_COLOR_HOME = 0xe2c275;
const MAP_COLOR_REPORT = 0xf7edd9;
const MAP_COLOR_ALLIED_TERRITORY = 0x2b8f98;

export interface MapReportMarkerView {
  id: string;
  kind: "CITY_BATTLE" | "BARBARIAN_BATTLE" | "RESOURCE_GATHER";
  label: string;
  x: number;
  y: number;
  resultTone: "success" | "warning" | "info";
}

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
  reportMarkers: MapReportMarkerView[];
  filter: MapFilter;
  showPaths: boolean;
  showScoutTrails: boolean;
  showReports: boolean;
  alliedOwnerNames: string[];
  allianceTag: string | null;
  allianceMarkers: AllianceMarkerView[];
  selectedCityId: string | null;
  selectedPoiId: string | null;
  selectedMarchId: string | null;
  onSelectCity: (cityId: string) => void;
  onSelectPoi: (poiId: string) => void;
  onSelectMarch: (marchId: string) => void;
  onOpenReport?: (reportId: string) => void;
  onOpenFieldCommand?: (command: MapFieldCommand) => void;
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

export interface MapFieldCommand {
  kind: "TILE" | "CITY" | "POI";
  label: string;
  x: number;
  y: number;
  cityId?: string;
  poiId?: string;
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
  objective: MarchView["objective"];
  originWorldX: number;
  originWorldY: number;
  targetWorldX: number;
  targetWorldY: number;
  bobSeed: number;
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
  velocityX: number;
  velocityY: number;
}

interface RouteLayerSnapshot {
  visible: boolean;
  detailLevel: MapDetailLevel;
  dashBucket: number;
  selectedCityId: string | null;
  selectedPoiId: string | null;
  selectedMarchId: string | null;
  marchSignature: string;
}

interface SelectionFxSnapshot {
  detailLevel: MapDetailLevel;
  selectedCityId: string | null;
  selectedPoiId: string | null;
  selectedMarchId: string | null;
  hasSelection: boolean;
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
  reportMarkers: MapReportMarkerView[];
  filter: MapFilter;
  showPaths: boolean;
  showScoutTrails: boolean;
  showReports: boolean;
  alliedOwnerNames: string[];
  allianceTag: string | null;
  allianceMarkers: AllianceMarkerView[];
  selectedCityId: string | null;
  selectedPoiId: string | null;
  selectedMarchId: string | null;
  onSelectCity: (cityId: string) => void;
  onSelectPoi: (poiId: string) => void;
  onSelectMarch: (marchId: string) => void;
  onOpenReport?: (reportId: string) => void;
  onOpenFieldCommand?: (command: MapFieldCommand) => void;
  onCameraChange: (state: MapCameraState) => void;
}

function hashCoordinate(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function getTerrainFill(tile: FogTileView): number {
  const hash = hashCoordinate(tile.x, tile.y) % 4;
  if (tile.state === "HIDDEN") {
    return [0x111112, 0x141416, 0x121214, 0x0f0f10][hash];
  }
  if (tile.state === "DISCOVERED") {
    return [0x1e1f1c, 0x222320, 0x20211e, 0x1c1d1a][hash];
  }
  return [0x2a2c28, 0x2e302b, 0x282a26, 0x31332c][hash];
}

function getMarchColor(objective: MarchView["objective"]): number {
  if (objective === "RESOURCE_GATHER") {
    return MAP_COLOR_GATHER;
  }
  if (objective === "BARBARIAN_ATTACK") {
    return MAP_COLOR_HOSTILE;
  }
  return MAP_COLOR_NEUTRAL;
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function distanceBetween(fromX: number, fromY: number, toX: number, toY: number) {
  return Math.hypot(toX - fromX, toY - fromY);
}

function angleBetween(fromX: number, fromY: number, toX: number, toY: number) {
  return Math.atan2(toY - fromY, toX - fromX);
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloatBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function easeSineInOut(value: number) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
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
  private reportMarkers: MapReportMarkerView[] = [];
  private filter: MapFilter = "ALL";
  private showPaths = true;
  private showScoutTrails = true;
  private showReports = true;
  private alliedOwnerNames = new Set<string>();
  private allianceTag: string | null = null;
  private allianceMarkers: AllianceMarkerView[] = [];
  private selectedCityId: string | null = null;
  private selectedPoiId: string | null = null;
  private selectedMarchId: string | null = null;
  private onSelectCity: (cityId: string) => void = () => undefined;
  private onSelectPoi: (poiId: string) => void = () => undefined;
  private onSelectMarch: (marchId: string) => void = () => undefined;
  private onOpenReport: (reportId: string) => void = () => undefined;
  private onOpenFieldCommand: (command: MapFieldCommand) => void = () => undefined;
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
  private reportLookup = new Map<string, PointLookup<MapReportMarkerView>>();
  private marchEntities = new Map<string, AnimatedMarchEntity>();
  private scoutEntities = new Map<string, ScoutTrailEntity>();
  private selectionObjects: Phaser.GameObjects.GameObject[] = [];
  private lastCameraState: MapCameraState | null = null;
  private lastRouteSnapshot: RouteLayerSnapshot | null = null;
  private lastSelectionSnapshot: SelectionFxSnapshot | null = null;
  private currentDetailLevel: MapDetailLevel = getMapDetailLevel(MAP_CAMERA_DEFAULT_ZOOM);
  private didInitialFocus = false;
  private dragState: DragState = {
    active: false,
    dragging: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    velocityX: 0,
    velocityY: 0,
  };
  private cameraDrift = { x: 0, y: 0 };
  private reducedMotion = false;

  constructor() {
    super("frontier-map");
  }

  create() {
    this.cameras.main.setBackgroundColor("#081319");
    this.reducedMotion =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    this.input.mouse?.disableContextMenu();
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
    this.applyCameraInertia();
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
    this.reportMarkers = config.reportMarkers;
    this.filter = config.filter;
    this.showPaths = config.showPaths;
    this.showScoutTrails = config.showScoutTrails;
    this.showReports = config.showReports;
    this.alliedOwnerNames = new Set(config.alliedOwnerNames);
    this.allianceTag = config.allianceTag;
    this.allianceMarkers = config.allianceMarkers;
    this.selectedCityId = config.selectedCityId;
    this.selectedPoiId = config.selectedPoiId;
    this.selectedMarchId = config.selectedMarchId;
    this.onSelectCity = config.onSelectCity;
    this.onSelectPoi = config.onSelectPoi;
    this.onSelectMarch = config.onSelectMarch;
    this.onOpenReport = config.onOpenReport ?? (() => undefined);
    this.onOpenFieldCommand = config.onOpenFieldCommand ?? (() => undefined);
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
    this.cameraDrift.x = 0;
    this.cameraDrift.y = 0;
    this.spawnPulse(point.x, point.y, 0xf4d79c, 16);
    this.cameras.main.pan(point.x, point.y, duration, "Cubic.easeOut", true);
  }

  private applyWorldBounds() {
    if (!this.isCameraReady()) {
      return;
    }
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.worldPixelSize, this.worldPixelSize);
    camera.setZoom(clampNumber(camera.zoom || MAP_CAMERA_DEFAULT_ZOOM, MAP_CAMERA_MIN_ZOOM, MAP_CAMERA_MAX_ZOOM));
  }

  private bindInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        this.handlePointerCommand(pointer);
        return;
      }

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
        velocityX: 0,
        velocityY: 0,
      };
      this.cameraDrift.x = 0;
      this.cameraDrift.y = 0;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragState.active || !pointer.isDown) {
        return;
      }

      const distance = distanceBetween(
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
      const scrollDeltaX = -dx / camera.zoom;
      const scrollDeltaY = -dy / camera.zoom;
      this.clampAndSetCameraScroll(camera.scrollX + scrollDeltaX, camera.scrollY + scrollDeltaY);
      this.dragState.velocityX = lerp(this.dragState.velocityX, scrollDeltaX, 0.45);
      this.dragState.velocityY = lerp(this.dragState.velocityY, scrollDeltaY, 0.45);
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
        this.cameraDrift.x = this.dragState.velocityX;
        this.cameraDrift.y = this.dragState.velocityY;
        this.emitCameraState(true);
        return;
      }

      this.handlePointerSelect(pointer);
    });

    this.input.on("pointerupoutside", () => {
      this.dragState.active = false;
      this.dragState.dragging = false;
      this.cameraDrift.x = this.dragState.velocityX;
      this.cameraDrift.y = this.dragState.velocityY;
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
    const clampedZoom = clampNumber(nextZoom, MAP_CAMERA_MIN_ZOOM, MAP_CAMERA_MAX_ZOOM);
    const worldBefore = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(clampedZoom);
    const worldAfter = camera.getWorldPoint(screenX, screenY);
    this.clampAndSetCameraScroll(
      camera.scrollX + (worldBefore.x - worldAfter.x),
      camera.scrollY + (worldBefore.y - worldAfter.y),
    );
    this.emitCameraState(true);
  }

  private applyCameraInertia() {
    if (!this.isCameraReady() || this.dragState.active) {
      return;
    }

    if (Math.abs(this.cameraDrift.x) < 0.03 && Math.abs(this.cameraDrift.y) < 0.03) {
      this.cameraDrift.x = 0;
      this.cameraDrift.y = 0;
      return;
    }

    const camera = this.cameras.main;
    this.clampAndSetCameraScroll(camera.scrollX + this.cameraDrift.x, camera.scrollY + this.cameraDrift.y);
    this.cameraDrift.x *= 0.9;
    this.cameraDrift.y *= 0.9;
  }

  private clampAndSetCameraScroll(nextScrollX: number, nextScrollY: number) {
    if (!this.isCameraReady()) {
      return;
    }

    const camera = this.cameras.main;
    const visibleWidth = this.scale.width / camera.zoom;
    const visibleHeight = this.scale.height / camera.zoom;
    const maxScrollX = Math.max(0, this.worldPixelSize - visibleWidth);
    const maxScrollY = Math.max(0, this.worldPixelSize - visibleHeight);
    camera.setScroll(
      clampNumber(nextScrollX, 0, maxScrollX),
      clampNumber(nextScrollY, 0, maxScrollY),
    );
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
    this.terrainGraphics.fillStyle(0x161618, 1);
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

    if (this.currentDetailLevel !== "near") {
      const halfWorld = Math.floor(this.worldPixelSize / 2);
      this.gridGraphics.lineStyle(2, 0xf4d79c, 0.12);
      this.gridGraphics.lineBetween(halfWorld, 0, halfWorld, this.worldPixelSize);
      this.gridGraphics.lineBetween(0, halfWorld, this.worldPixelSize, halfWorld);
    }
  }

  private syncObjectLayer() {
    this.clearLayer(this.objectLayer);
    this.clearLayer(this.uiLayer);
    this.cityLookup.clear();
    this.poiLookup.clear();
    this.reportLookup.clear();

    if (!this.objectLayer || !this.uiLayer) {
      return;
    }

    const showLabels = this.currentDetailLevel !== "far";
    const showNearDetail = this.currentDetailLevel === "near";

    if (this.currentDetailLevel !== "near") {
      for (const region of getWorldRegions(this.worldSize)) {
        const regionLabel = this.add
          .text(
            (region.anchorX + 0.5) * MAP_TILE_WORLD_SIZE,
            (region.anchorY + 0.5) * MAP_TILE_WORLD_SIZE,
            region.label,
            {
              color: region.color,
              fontFamily: "'Cinzel', 'Palatino Linotype', serif",
              fontSize: this.currentDetailLevel === "far" ? "22px" : "28px",
              fontStyle: "italic",
              stroke: "#130b08",
              strokeThickness: 4,
            },
          )
          .setOrigin(0.5)
          .setAlpha(this.currentDetailLevel === "far" ? 0.18 : 0.24);
        this.uiLayer.add(regionLabel);
      }
    }

    for (const marker of this.allianceMarkers) {
      const point = tileToWorld(marker.x, marker.y);
      const beacon = this.add.circle(point.x, point.y, this.currentDetailLevel === "far" ? 18 : 24, 0x53c8d2, 0.14);
      const pin = this.add.triangle(point.x, point.y - 4, 0, 0, 18, 18, 9, 30, MAP_COLOR_ALLIED, 0.92);
      const core = this.add.circle(point.x, point.y + 2, 4, MAP_COLOR_NEUTRAL, 0.94);
      this.objectLayer.add([beacon, pin, core]);
      this.addAmbientPulse(beacon, {
        minScale: 0.96,
        maxScale: this.currentDetailLevel === "far" ? 1.06 : 1.12,
        minAlpha: 0.05,
        maxAlpha: 0.16,
        duration: 1800 + (hashCoordinate(marker.x, marker.y) % 5) * 190,
      });

      if (showLabels) {
        const label = this.add
          .text(point.x, point.y + 20, marker.label, {
            color: "#dff9fb",
            fontFamily: "'Inter', sans-serif",
            fontSize: showNearDetail ? "12px" : "10px",
            backgroundColor: "rgba(7, 22, 26, 0.72)",
            padding: { x: 6, y: 3 },
          })
          .setOrigin(0.5, 0);
        this.uiLayer.add(label);
        this.addLabelFloat(label, point.y + 20, hashCoordinate(marker.x + 3, marker.y + 7));
      }
    }

    if (this.showReports) {
      for (const report of this.reportMarkers) {
        const point = tileToWorld(report.x, report.y);
        this.reportLookup.set(report.id, { worldX: point.x, worldY: point.y, data: report });
        const bubbleColor =
          report.resultTone === "success" ? 0x4fb07d : report.resultTone === "warning" ? MAP_COLOR_HOSTILE : 0x5e9fcb;
        const bubble = this.add.circle(point.x, point.y - 18, this.currentDetailLevel === "far" ? 10 : 12, bubbleColor, 0.92);
        const ping = this.add.circle(point.x, point.y - 18, this.currentDetailLevel === "far" ? 14 : 18, bubbleColor, 0.08);
        const glyph = this.add
          .text(point.x, point.y - 18, report.kind === "RESOURCE_GATHER" ? "G" : report.kind === "BARBARIAN_BATTLE" ? "B" : "R", {
            color: "#f8f0dd",
            fontFamily: "'Inter', sans-serif",
            fontSize: this.currentDetailLevel === "far" ? "10px" : "11px",
            fontStyle: "700",
          })
          .setOrigin(0.5);
        this.objectLayer.add([ping, bubble]);
        this.uiLayer.add(glyph);
        this.addAmbientPulse(ping, {
          minScale: 0.96,
          maxScale: 1.12,
          minAlpha: 0.03,
          maxAlpha: 0.12,
          duration: 2200 + (hashCoordinate(report.x, report.y) % 5) * 120,
        });

        if (showLabels && this.currentDetailLevel !== "far") {
          const label = this.add
            .text(point.x, point.y - 40, report.label, {
              color: "#f8f0dd",
              fontFamily: "'Inter', sans-serif",
              fontSize: showNearDetail ? "11px" : "10px",
              backgroundColor: "rgba(20, 13, 11, 0.58)",
              padding: { x: 5, y: 3 },
            })
            .setOrigin(0.5, 1);
          this.uiLayer.add(label);
        }
      }
    }

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
        fortOuter.setStrokeStyle(selected ? 4 : 2, selected ? MAP_COLOR_NEUTRAL : MAP_COLOR_REPORT, 0.95);
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
        marker.setStrokeStyle(selected ? 4 : 2, selected ? MAP_COLOR_NEUTRAL : MAP_COLOR_REPORT, 0.95);
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
      const allied = !city.isCurrentPlayer && this.alliedOwnerNames.has(city.ownerName);
      const auraColor = city.isCurrentPlayer ? MAP_COLOR_HOME : allied ? 0x5c8a99 : city.fogState === "VISIBLE" ? 0x8a2c2c : 0x555558;
      const cityColor = city.isCurrentPlayer ? 0xd4af37 : allied ? 0x4aa7b5 : city.fogState === "VISIBLE" ? 0xa54842 : 0x737376;

      if (allied) {
        const territory = this.add.circle(point.x, point.y, this.currentDetailLevel === "near" ? 72 : 64, MAP_COLOR_ALLIED_TERRITORY, 0.08);
        this.objectLayer.add(territory);
        this.addAmbientPulse(territory, {
          minScale: 0.98,
          maxScale: 1.1,
          minAlpha: 0.03,
          maxAlpha: 0.1,
          duration: 2400 + (hashCoordinate(city.x, city.y + 13) % 5) * 180,
        });
      }
      const aura = this.add.circle(point.x, point.y, 38, auraColor, city.isCurrentPlayer ? 0.18 : 0.12);
      const marker = this.add.circle(point.x, point.y, 20, cityColor, 0.98);
      const core = this.add.rectangle(point.x, point.y, 12, 12, 0x1b100b, 0.72).setAngle(45);
      marker.setStrokeStyle(selected ? 4 : 2, selected ? MAP_COLOR_NEUTRAL : MAP_COLOR_REPORT, 0.95);

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
          .text(point.x, point.y - 30, city.isCurrentPlayer ? "You" : allied && this.allianceTag ? `[${this.allianceTag}] ${city.cityName}` : city.cityName, {
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
    const selection = this.getSelectionPoint();
    const snapshot: SelectionFxSnapshot = {
      detailLevel: this.currentDetailLevel,
      selectedCityId: this.selectedCityId,
      selectedPoiId: this.selectedPoiId,
      selectedMarchId: this.selectedMarchId,
      hasSelection: Boolean(selection),
    };

    if (
      this.lastSelectionSnapshot &&
      this.lastSelectionSnapshot.detailLevel === snapshot.detailLevel &&
      this.lastSelectionSnapshot.selectedCityId === snapshot.selectedCityId &&
      this.lastSelectionSnapshot.selectedPoiId === snapshot.selectedPoiId &&
      this.lastSelectionSnapshot.selectedMarchId === snapshot.selectedMarchId &&
      this.lastSelectionSnapshot.hasSelection === snapshot.hasSelection
    ) {
      return;
    }

    this.lastSelectionSnapshot = snapshot;
    for (const object of this.selectionObjects) {
      object.destroy();
    }
    this.selectionObjects = [];

    if (!this.fxLayer) {
      return;
    }

    if (!selection) {
      return;
    }

    const ringRadius = this.selectedMarchId ? 28 : 32;
    const accent = this.selectedMarchId ? MAP_COLOR_SCOUT : MAP_COLOR_NEUTRAL;
    const secondary = this.selectedMarchId ? MAP_COLOR_NEUTRAL : MAP_COLOR_ALLIED;
    const halo = this.add.circle(selection.x, selection.y, ringRadius + 12, accent, this.selectedMarchId ? 0.08 : 0.1);
    const outer = this.add.circle(selection.x, selection.y, ringRadius, 0x000000, 0);
    outer.setStrokeStyle(3, accent, 0.92);
    const tracker = this.add.arc(selection.x, selection.y, ringRadius + 7, 18, 148, false, secondary, 0);
    tracker.setStrokeStyle(4, secondary, 0.82);
    const core = this.add.circle(selection.x, selection.y, this.selectedMarchId ? 7 : 8, accent, 0.14);
    core.setStrokeStyle(2, secondary, 0.52);

    this.fxLayer.add([halo, outer, tracker, core]);
    this.selectionObjects.push(halo, outer, tracker, core);

    if (this.reducedMotion) {
      halo.setAlpha(0.08);
      outer.setAlpha(0.72);
      tracker.setAlpha(0.52);
      core.setAlpha(0.16);
      return;
    }

    this.tweens.add({
      targets: halo,
      scale: { from: 0.96, to: 1.16 },
      alpha: { from: 0.16, to: 0.04 },
      duration: 1400,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: outer,
      scale: { from: 0.94, to: 1.08 },
      alpha: { from: 0.9, to: 0.58 },
      duration: 1100,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: tracker,
      angle: 360,
      duration: 3200,
      ease: "Linear",
      repeat: -1,
    });
    this.tweens.add({
      targets: core,
      scale: { from: 0.92, to: 1.18 },
      alpha: { from: 0.24, to: 0.1 },
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
        this.spawnMarchResolutionFx(entity);
        entity.container.destroy(true);
        this.marchEntities.delete(marchId);
      }
    }

    for (const march of this.marches) {
      const origin = tileToWorld(march.origin.x, march.origin.y);
      const target = tileToWorld(march.target.x, march.target.y);
      const existingEntity = this.marchEntities.get(march.id);
      if (existingEntity) {
        existingEntity.objective = march.objective;
        existingEntity.originWorldX = origin.x;
        existingEntity.originWorldY = origin.y;
        existingEntity.targetWorldX = target.x;
        existingEntity.targetWorldY = target.y;
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
        objective: march.objective,
        originWorldX: origin.x,
        originWorldY: origin.y,
        targetWorldX: target.x,
        targetWorldY: target.y,
        bobSeed: hashCoordinate(march.origin.x, march.origin.y),
        lastPhase: getAnimatedPhase(march),
        lastTrailAt: 0,
      };
      this.marchEntities.set(march.id, entity);

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

    if (!this.showScoutTrails) {
      for (const [trailId, entity] of this.scoutEntities) {
        entity.routeGraphic.destroy();
        entity.container.destroy(true);
        this.scoutEntities.delete(trailId);
      }
      return;
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
      routeGraphic.lineStyle(2, MAP_COLOR_SCOUT, 0.48);
      routeGraphic.lineBetween(from.x, from.y, to.x, to.y);
      this.routeLayer.add(routeGraphic);

      const shadow = this.add.ellipse(0, 10, 24, 10, 0x000000, 0.22);
      const body = this.add.circle(0, 0, 8, MAP_COLOR_SCOUT, 0.98);
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

      this.spawnPulse(from.x, from.y, MAP_COLOR_SCOUT, 18);
    }
  }

  private updateRouteLayer() {
    if (!this.routeGraphics) {
      return;
    }

    const dashOffset = this.currentDetailLevel === "far" ? 0 : (this.time.now / 36) % 20;
    const snapshot: RouteLayerSnapshot = {
      visible: this.showPaths,
      detailLevel: this.currentDetailLevel,
      dashBucket:
        this.currentDetailLevel === "far"
          ? 0
          : Math.floor(dashOffset / (this.currentDetailLevel === "near" ? 1.8 : 2.8)),
      selectedCityId: this.selectedCityId,
      selectedPoiId: this.selectedPoiId,
      selectedMarchId: this.selectedMarchId,
      marchSignature: this.marches
        .map((march) =>
          [
            march.id,
            march.state,
            march.objective,
            `${march.origin.x},${march.origin.y}`,
            `${march.target.x},${march.target.y}`,
            march.targetCityId ?? "",
            march.targetPoiId ?? "",
          ].join(":"),
        )
        .join("|"),
    };

    if (
      this.lastRouteSnapshot &&
      this.lastRouteSnapshot.visible === snapshot.visible &&
      this.lastRouteSnapshot.detailLevel === snapshot.detailLevel &&
      this.lastRouteSnapshot.dashBucket === snapshot.dashBucket &&
      this.lastRouteSnapshot.selectedCityId === snapshot.selectedCityId &&
      this.lastRouteSnapshot.selectedPoiId === snapshot.selectedPoiId &&
      this.lastRouteSnapshot.selectedMarchId === snapshot.selectedMarchId &&
      this.lastRouteSnapshot.marchSignature === snapshot.marchSignature
    ) {
      return;
    }

    this.lastRouteSnapshot = snapshot;
    this.routeGraphics.clear();
    if (!this.showPaths) {
      return;
    }

    for (const march of this.marches) {
      const origin = tileToWorld(march.origin.x, march.origin.y);
      const target = tileToWorld(march.target.x, march.target.y);
      const color = getMarchColor(march.objective);
      const highlight =
        march.id === this.selectedMarchId ||
        (march.targetCityId && march.targetCityId === this.selectedCityId) ||
        (march.targetPoiId && march.targetPoiId === this.selectedPoiId);
      const alpha = highlight ? 0.95 : this.currentDetailLevel === "far" ? 0.42 : 0.62;
      const angle = angleBetween(origin.x, origin.y, target.x, target.y);
      const trailWidth = this.currentDetailLevel === "far" ? 2 : 3;
      const underlayWidth = this.currentDetailLevel === "far" ? 6 : 8;
      const arrowProgress = this.currentDetailLevel === "far" ? 0.56 : 0.68;
      const arrowSize = highlight ? (this.currentDetailLevel === "far" ? 9 : 12) : this.currentDetailLevel === "far" ? 7 : 10;
      const arrowX = lerp(origin.x, target.x, arrowProgress);
      const arrowY = lerp(origin.y, target.y, arrowProgress);
      this.routeGraphics.lineStyle(underlayWidth, 0x090d10, highlight ? 0.34 : 0.2);
      this.routeGraphics.lineBetween(origin.x, origin.y, target.x, target.y);
      this.routeGraphics.lineStyle(trailWidth + 1, color, highlight ? 0.24 : 0.16);
      this.routeGraphics.lineBetween(origin.x, origin.y, target.x, target.y);
      this.routeGraphics.lineStyle(trailWidth, color, alpha);
      if (this.currentDetailLevel === "far") {
        this.routeGraphics.lineBetween(origin.x, origin.y, target.x, target.y);
      } else {
        this.drawDashedLine(this.routeGraphics, origin.x, origin.y, target.x, target.y, dashOffset);
      }
      this.routeGraphics.fillStyle(color, highlight ? 0.92 : 0.72);
      this.routeGraphics.beginPath();
      this.routeGraphics.moveTo(arrowX + Math.cos(angle) * arrowSize, arrowY + Math.sin(angle) * arrowSize);
      this.routeGraphics.lineTo(
        arrowX + Math.cos(angle + Math.PI * 0.78) * arrowSize * 0.82,
        arrowY + Math.sin(angle + Math.PI * 0.78) * arrowSize * 0.82,
      );
      this.routeGraphics.lineTo(
        arrowX + Math.cos(angle - Math.PI * 0.78) * arrowSize * 0.82,
        arrowY + Math.sin(angle - Math.PI * 0.78) * arrowSize * 0.82,
      );
      this.routeGraphics.closePath();
      this.routeGraphics.fillPath();
      this.routeGraphics.lineStyle(2, 0xf7edd9, highlight ? 0.88 : 0.46);
      this.routeGraphics.strokeCircle(target.x, target.y, highlight ? 10 : 8);
      this.routeGraphics.fillStyle(color, highlight ? 0.95 : 0.7);
      this.routeGraphics.fillCircle(target.x, target.y, highlight ? 6 : 5);
      this.routeGraphics.fillStyle(0xf7edd9, highlight ? 0.92 : 0.72);
      this.routeGraphics.fillCircle(target.x, target.y, highlight ? 2.5 : 2);
    }
  }

  private drawDashedLine(graphics: Phaser.GameObjects.Graphics, fromX: number, fromY: number, toX: number, toY: number, offset: number) {
    const dashLength = this.currentDetailLevel === "far" ? 16 : 22;
    const gapLength = this.currentDetailLevel === "far" ? 12 : 14;
    const totalLength = distanceBetween(fromX, fromY, toX, toY);
    if (totalLength <= 0) {
      return;
    }

    const angle = angleBetween(fromX, fromY, toX, toY);
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
      const travelProgress = this.getMarchProgress(march, phase, nowMs);
      const pointX =
        phase === "staging" || phase === "gathering"
          ? entity.targetWorldX
          : phase === "returning"
            ? lerp(entity.targetWorldX, entity.originWorldX, travelProgress)
            : lerp(entity.originWorldX, entity.targetWorldX, travelProgress);
      const pointY =
        phase === "staging" || phase === "gathering"
          ? entity.targetWorldY
          : phase === "returning"
            ? lerp(entity.targetWorldY, entity.originWorldY, travelProgress)
            : lerp(entity.originWorldY, entity.targetWorldY, travelProgress);
      const destinationX = phase === "returning" ? entity.originWorldX : entity.targetWorldX;
      const destinationY = phase === "returning" ? entity.originWorldY : entity.targetWorldY;
      const direction = angleBetween(pointX, pointY, destinationX, destinationY);

      if (entity.lastPhase !== phase && (phase === "staging" || phase === "gathering")) {
        this.spawnPulse(destinationX, destinationY, getMarchColor(march.objective), 20);
      }

      entity.container.setPosition(pointX, pointY);
      entity.container.setRotation(direction + Math.PI / 2);

      const compact = detail === "far";
      entity.compactToken.setVisible(compact);
      entity.shadow.setVisible(!compact);
      entity.troopLead.setVisible(!compact);
      entity.troopSupport.setVisible(!compact);
      entity.bannerPole.setVisible(!compact);
      entity.bannerPennant.setVisible(!compact);

      if (compact) {
        entity.compactToken.setScale(phase === "staging" ? 0.98 : 0.88);
        entity.stagingRing.setVisible(false);
        entity.gatherSpinner.setVisible(false);
      } else {
        const bob = Math.sin(this.time.now / 180 + entity.bobSeed) * 1.4;
        entity.troopLead.setY(2 + bob);
        entity.troopSupport.setY(4 - bob * 0.7);
        entity.bannerPennant.setScale(1, 1 + Math.sin(this.time.now / 120 + march.distance) * 0.08);
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
      }
      const trailInterval = detail === "near" ? 130 : detail === "mid" ? 240 : 480;
      const trailScale = detail === "near" ? 0.76 : detail === "mid" ? 0.46 : 0;
      if ((phase === "moving" || phase === "returning") && trailScale > 0 && this.time.now - entity.lastTrailAt > trailInterval) {
        entity.lastTrailAt = this.time.now;
        this.spawnTrailDust(pointX, pointY, getMarchColor(march.objective), direction + Math.PI, trailScale);
      }

      entity.lastPhase = phase;
    }
  }

  private updateScoutTrails() {
    if (!this.showScoutTrails) {
      return;
    }

    const nowMs = Date.now();

    for (const entity of this.scoutEntities.values()) {
      const progress = clampNumber((nowMs - entity.startedAtMs) / entity.durationMs, 0, 1);
      const easedProgress = easeSineInOut(progress);
      const pointX = lerp(entity.from.x, entity.to.x, easedProgress);
      const pointY = lerp(entity.from.y, entity.to.y, easedProgress);
      const direction = angleBetween(pointX, pointY, entity.to.x, entity.to.y);

      entity.container.setPosition(pointX, pointY);
      entity.container.setRotation(direction + Math.PI / 2);
      if (this.currentDetailLevel === "far") {
        entity.container.setScale(0.82);
        entity.shadow.setScale(1);
        entity.pennant.setScale(1, 1);
      } else if (this.currentDetailLevel === "near") {
        entity.container.setScale(1.05);
        entity.shadow.setScale(1 + Math.sin(this.time.now / 180) * 0.08);
        entity.pennant.setScale(1, 1 + Math.sin(this.time.now / 140) * 0.1);
      } else {
        entity.container.setScale(0.94);
        entity.shadow.setScale(1 + Math.sin(this.time.now / 220) * 0.05);
        entity.pennant.setScale(1, 1 + Math.sin(this.time.now / 170) * 0.06);
      }

      if (progress >= 1 && !entity.arrived) {
        entity.arrived = true;
        this.spawnPulse(entity.to.x, entity.to.y, 0xfacc15, 16);
      }

      const trailInterval = this.currentDetailLevel === "near" ? 120 : this.currentDetailLevel === "mid" ? 190 : 360;
      const trailScale = this.currentDetailLevel === "near" ? 0.48 : this.currentDetailLevel === "mid" ? 0.32 : 0;
      if (progress < 1 && trailScale > 0 && this.time.now - entity.lastTrailAt > trailInterval) {
        entity.lastTrailAt = this.time.now;
        this.spawnTrailDust(pointX, pointY, MAP_COLOR_SCOUT, direction + Math.PI, trailScale);
      }
    }
  }

  private getMarchProgress(march: MarchView, phase: AnimatedMarchPhase, nowMs: number) {
    if (phase === "staging" || phase === "gathering") {
      return 1;
    }
    if (phase === "returning") {
      const startedAt = Date.parse(march.gatherStartedAt ?? march.etaAt);
      const endsAt = Date.parse(march.returnEtaAt ?? march.etaAt);
      return endsAt <= startedAt ? 1 : clampNumber((nowMs - startedAt) / (endsAt - startedAt), 0, 1);
    }

    const startedAt = Date.parse(march.startedAt);
    const endsAt = Date.parse(march.etaAt);
    return endsAt <= startedAt ? 1 : clampNumber((nowMs - startedAt) / (endsAt - startedAt), 0, 1);
  }

  private spawnPulse(x: number, y: number, color: number, radius: number) {
    if (!this.fxLayer) {
      return;
    }

    const pulse = this.add.circle(x, y, radius, color, 0);
    pulse.setStrokeStyle(3, color, 0.72);
    this.fxLayer.add(pulse);
    if (this.reducedMotion) {
      pulse.setAlpha(0.32);
      this.time.delayedCall(180, () => pulse.destroy());
      return;
    }
    this.tweens.add({
      targets: pulse,
      scale: 2.2,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private spawnMarchResolutionFx(entity: AnimatedMarchEntity) {
    const { container, objective, lastPhase, targetWorldX, targetWorldY } = entity;
    const x = container.x;
    const y = container.y;
    const color = getMarchColor(objective);
    const reachedTarget = distanceBetween(x, y, targetWorldX, targetWorldY) < MAP_TILE_WORLD_SIZE * 0.35;

    if (objective === "RESOURCE_GATHER" && lastPhase === "returning") {
      this.spawnPulse(x, y, MAP_COLOR_SCOUT, 20);
      this.spawnSparkBurst(x, y, MAP_COLOR_NEUTRAL, 6, 22, 420);
      return;
    }

    if ((objective === "CITY_ATTACK" || objective === "BARBARIAN_ATTACK" || lastPhase === "staging") && reachedTarget) {
      this.spawnPulse(x, y, color, 28);
      if (this.currentDetailLevel !== "far") {
        this.spawnShockwave(x, y, color, 34);
      }
      this.spawnSparkBurst(x, y, MAP_COLOR_REPORT, objective === "CITY_ATTACK" ? 10 : 8, 30, 520);
      this.spawnSparkBurst(x, y, color, objective === "CITY_ATTACK" ? 7 : 6, 38, 640);
      return;
    }

    this.spawnPulse(x, y, color, 22);
  }

  private spawnShockwave(x: number, y: number, color: number, radius: number) {
    if (!this.fxLayer) {
      return;
    }

    const ring = this.add.circle(x, y, radius, 0x000000, 0);
    ring.setStrokeStyle(4, color, 0.72);
    this.fxLayer.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 620,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private spawnSparkBurst(
    x: number,
    y: number,
    color: number,
    count: number,
    distance: number,
    duration: number,
  ) {
    if (!this.fxLayer) {
      return;
    }

    const densityScale = this.reducedMotion ? 0.45 : this.currentDetailLevel === "far" ? 0.4 : this.currentDetailLevel === "mid" ? 0.72 : 1;
    const burstCount = Math.max(2, Math.round(count * densityScale));
    const burstDistance = Math.max(12, Math.round(distance * densityScale));
    const burstDuration = Math.max(240, Math.round(duration * (this.currentDetailLevel === "far" ? 0.72 : 1)));

    for (let index = 0; index < burstCount; index += 1) {
      const angle = (Math.PI * 2 * index) / burstCount + randomFloatBetween(-0.16, 0.16);
      const spark = this.add.rectangle(x, y, 3, randomBetween(8, 14), color, 0.92);
      spark.setRotation(angle + Math.PI / 2);
      this.fxLayer.add(spark);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * randomBetween(Math.floor(burstDistance * 0.55), burstDistance),
        y: y + Math.sin(angle) * randomBetween(Math.floor(burstDistance * 0.55), burstDistance),
        scaleY: 0.4,
        alpha: 0,
        duration: burstDuration + randomBetween(-80, 120),
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private spawnTrailDust(x: number, y: number, color: number, angle: number, scale = 0.8) {
    if (!this.fxLayer || this.reducedMotion || scale <= 0) {
      return;
    }

    const offsetX = Math.cos(angle) * randomBetween(8, 18);
    const offsetY = Math.sin(angle) * randomBetween(8, 18);
    const dust = this.add.circle(x + offsetX, y + offsetY, randomFloatBetween(3, 6) * scale, color, 0.3);
    this.fxLayer.add(dust);
    this.tweens.add({
      targets: dust,
      x: dust.x + Math.cos(angle) * randomBetween(12, 22),
      y: dust.y + Math.sin(angle) * randomBetween(12, 22),
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
    if (this.reducedMotion || this.currentDetailLevel === "far") {
      return;
    }
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
    if (this.reducedMotion) {
      return;
    }
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
    const report = this.showReports ? this.findNearestReport(worldPoint.x, worldPoint.y) : null;
    if (report) {
      this.onOpenReport(report.data.id);
      return;
    }
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

  private handlePointerCommand(pointer: Phaser.Input.Pointer) {
    if (!this.isCameraReady()) {
      return;
    }

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const poi = this.findNearestPoi(worldPoint.x, worldPoint.y);
    if (poi) {
      this.spawnPulse(poi.worldX, poi.worldY, MAP_COLOR_ALLIED, 14);
      this.onOpenFieldCommand({
        kind: "POI",
        label: poi.data.label,
        x: poi.data.x,
        y: poi.data.y,
        poiId: poi.data.id,
      });
      return;
    }

    const city = this.findNearestCity(worldPoint.x, worldPoint.y);
    if (city) {
      this.spawnPulse(city.worldX, city.worldY, city.data.isCurrentPlayer ? MAP_COLOR_ALLIED : MAP_COLOR_NEUTRAL, 14);
      this.onOpenFieldCommand({
        kind: "CITY",
        label: city.data.cityName,
        x: city.data.x,
        y: city.data.y,
        cityId: city.data.cityId,
      });
      return;
    }

    const tile = worldToTile(worldPoint.x, worldPoint.y, this.worldSize);
    const point = tileToWorld(tile.x, tile.y);
    this.spawnPulse(point.x, point.y, MAP_COLOR_NEUTRAL, 12);
    this.onOpenFieldCommand({
      kind: "TILE",
      label: `Frontier ${tile.x},${tile.y}`,
      x: tile.x,
      y: tile.y,
    });
  }

  private findNearestMarch(worldX: number, worldY: number) {
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entity of this.marchEntities.values()) {
      const threshold = this.currentDetailLevel === "far" ? 20 : 32;
      const distance = distanceBetween(worldX, worldY, entity.container.x, entity.container.y);
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
      const distance = distanceBetween(worldX, worldY, poi.worldX, poi.worldY);
      if (distance < 30 && distance < bestDistance) {
        best = poi;
        bestDistance = distance;
      }
    }
    return best;
  }

  private findNearestReport(worldX: number, worldY: number) {
    let best: PointLookup<MapReportMarkerView> | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const report of this.reportLookup.values()) {
      const distance = distanceBetween(worldX, worldY, report.worldX, report.worldY - 18);
      if (distance < 24 && distance < bestDistance) {
        best = report;
        bestDistance = distance;
      }
    }
    return best;
  }

  private findNearestCity(worldX: number, worldY: number) {
    let best: PointLookup<MapCity> | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const city of this.cityLookup.values()) {
      const distance = distanceBetween(worldX, worldY, city.worldX, city.worldY);
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
  reportMarkers,
  filter,
  showPaths,
  showScoutTrails,
  showReports,
  alliedOwnerNames,
  allianceTag,
  allianceMarkers,
  selectedCityId,
  selectedPoiId,
  selectedMarchId,
  onSelectCity,
  onSelectPoi,
  onSelectMarch,
  onOpenReport,
  onOpenFieldCommand,
  onCameraChange,
  commandHandleRef,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<FrontierMapScene | null>(null);
  const hoverRef = useRef(false);
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

    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    const preventWheelScroll = (event: WheelEvent) => {
      event.preventDefault();
    };
    const handlePointerEnter = () => {
      hoverRef.current = true;
    };
    const handlePointerLeave = () => {
      hoverRef.current = false;
    };
    const handleGlobalWheel = (event: WheelEvent) => {
      if (!hoverRef.current) {
        return;
      }
      event.preventDefault();
    };

    containerRef.current.addEventListener("contextmenu", preventContextMenu);
    containerRef.current.addEventListener("wheel", preventWheelScroll, { passive: false });
    containerRef.current.addEventListener("pointerenter", handlePointerEnter);
    containerRef.current.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("wheel", handleGlobalWheel, { passive: false, capture: true });

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setViewport({
        width: Math.max(320, Math.floor(width)),
        height: Math.max(420, Math.floor(height)),
      });
    });

    observer.observe(containerRef.current);
    return () => {
      containerRef.current?.removeEventListener("contextmenu", preventContextMenu);
      containerRef.current?.removeEventListener("wheel", preventWheelScroll);
      containerRef.current?.removeEventListener("pointerenter", handlePointerEnter);
      containerRef.current?.removeEventListener("pointerleave", handlePointerLeave);
      hoverRef.current = false;
      window.removeEventListener("wheel", handleGlobalWheel, true);
      observer.disconnect();
    };
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
      reportMarkers,
      filter,
      showPaths,
      showScoutTrails,
      showReports,
      alliedOwnerNames,
      allianceTag,
      allianceMarkers,
      selectedCityId,
      selectedPoiId,
      selectedMarchId,
      onSelectCity,
      onSelectPoi,
      onSelectMarch,
      onOpenReport,
      onOpenFieldCommand,
      onCameraChange,
    });
  }, [
    cities,
    filter,
    reportMarkers,
    showPaths,
    showReports,
    showScoutTrails,
    initialCenter,
    alliedOwnerNames,
    allianceMarkers,
    allianceTag,
    marches,
    onCameraChange,
    onOpenFieldCommand,
    onSelectCity,
    onSelectMarch,
    onSelectPoi,
    onOpenReport,
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

  return <div ref={containerRef} className={styles.mapCanvas} data-map-canvas="true" />;
}
