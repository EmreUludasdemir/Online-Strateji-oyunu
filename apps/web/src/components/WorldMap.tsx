import type {
  AllianceMarkerView,
  BuildingType,
  FogTileView,
  MapCity,
  MarchView,
  PoiResourceType,
  PoiView,
} from "@frontier/shared";
import { type MutableRefObject, useEffect, useRef, useState } from "react";

import Phaser from "./phaserRuntime";
import styles from "./WorldMap.module.css";
import { BUILDING_ICONS } from "./ui/buildingIcons";
import {
  getKingdomPasses,
  getKingdomRingRadii,
  getKingdomSanctuaries,
  getKingdomTier,
  getNearestKingdomPass,
  isKingdomMountainTile,
} from "./kingdomMap";
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
const MAP_COLOR_MOUNTAIN = 0x6f6254;
const MAP_COLOR_MOUNTAIN_SHADOW = 0x262522;
const MAP_COLOR_PASS = 0xf4d79c;
const MAP_COLOR_TEMPLE = 0xd7b4ff;

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
  playerCityBuildings?: ReadonlyArray<PlayerCityDistrictView>;
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
  projectTileToViewport: (x: number, y: number) => {
    worldX: number;
    worldY: number;
    canvasX: number;
    canvasY: number;
    withinViewport: boolean;
    viewport: {
      width: number;
      height: number;
    };
    camera: {
      scrollX: number;
      scrollY: number;
      zoom: number;
      centerWorldX: number;
      centerWorldY: number;
      centerTileX: number;
      centerTileY: number;
    };
  } | null;
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
  troopLead: Phaser.GameObjects.Image;
  troopSupport: Phaser.GameObjects.Image;
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
  body: Phaser.GameObjects.Image;
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

interface AmbientMoteEntity {
  glow: Phaser.GameObjects.Arc;
  body: Phaser.GameObjects.Arc;
  baseX: number;
  baseY: number;
  driftX: number;
  driftY: number;
  radius: number;
  seed: number;
  speed: number;
}

interface BaseStaticGraphicBundle {
  kind: "alliance-marker" | "report" | "poi-camp" | "poi-node" | "city";
  container: Phaser.GameObjects.Container;
}

interface AllianceMarkerGraphicBundle extends BaseStaticGraphicBundle {
  kind: "alliance-marker";
  beacon: Phaser.GameObjects.Arc;
  sprite: Phaser.GameObjects.Image;
}

interface ReportGraphicBundle extends BaseStaticGraphicBundle {
  kind: "report";
  ping: Phaser.GameObjects.Arc;
  bubble: Phaser.GameObjects.Arc;
}

export interface PlayerCityDistrictView {
  type: BuildingType;
  level: number;
}

interface PlayerCityDistrictsEntity {
  container: Phaser.GameObjects.Container;
  sprites: Map<BuildingType, Phaser.GameObjects.Image>;
  centerWorldX: number;
  centerWorldY: number;
}

interface PoiCampGraphicBundle extends BaseStaticGraphicBundle {
  kind: "poi-camp";
  aura: Phaser.GameObjects.Arc;
  sprite: Phaser.GameObjects.Image;
}

interface PoiNodeGraphicBundle extends BaseStaticGraphicBundle {
  kind: "poi-node";
  aura: Phaser.GameObjects.Arc;
  sprite: Phaser.GameObjects.Image;
}

interface CityGraphicBundle extends BaseStaticGraphicBundle {
  kind: "city";
  territory: Phaser.GameObjects.Arc;
  aura: Phaser.GameObjects.Arc;
  sprite: Phaser.GameObjects.Image;
}

type StaticGraphicBundle =
  | AllianceMarkerGraphicBundle
  | ReportGraphicBundle
  | PoiCampGraphicBundle
  | PoiNodeGraphicBundle
  | CityGraphicBundle;

type ToggleableGameObject = Phaser.GameObjects.GameObject & {
  setVisible: (visible: boolean) => Phaser.GameObjects.GameObject;
  setActive: (active: boolean) => Phaser.GameObjects.GameObject;
};

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
  playerCityBuildings: ReadonlyArray<PlayerCityDistrictView>;
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

function getTerrainFill(tile: FogTileView, worldSize: number): number {
  const hash = hashCoordinate(tile.x, tile.y) % 4;
  const tier = getKingdomTier(tile.x, tile.y, worldSize).id;
  if (tile.state === "HIDDEN") {
    if (tier === "TIER_3") {
      return [0x15121c, 0x171420, 0x12101a, 0x191620][hash];
    }
    if (tier === "TIER_2") {
      return [0x111920, 0x121b23, 0x10171e, 0x151d24][hash];
    }
    return [0x101612, 0x121915, 0x0f1411, 0x141a16][hash];
  }
  if (tile.state === "DISCOVERED") {
    if (tier === "TIER_3") {
      return [0x2c2438, 0x30283e, 0x292333, 0x342a41][hash];
    }
    if (tier === "TIER_2") {
      return [0x243344, 0x27384a, 0x22303e, 0x2a3a49][hash];
    }
    return [0x223129, 0x26362d, 0x202d26, 0x29382f][hash];
  }
  if (tier === "TIER_3") {
    return [0x403252, 0x47395a, 0x3a2e4c, 0x4a3a5a][hash];
  }
  if (tier === "TIER_2") {
    return [0x2f4960, 0x34516a, 0x2b4358, 0x38566c][hash];
  }
  return [0x2e4a3b, 0x345241, 0x2a4336, 0x385743][hash];
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
  private ambientLayer?: Phaser.GameObjects.Layer;
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
  private staticLabelCache = new Map<string, Phaser.GameObjects.Text>();
  private staticGraphicCache = new Map<string, StaticGraphicBundle>();
  private ambientMotes: AmbientMoteEntity[] = [];
  private marchEntities = new Map<string, AnimatedMarchEntity>();
  private scoutEntities = new Map<string, ScoutTrailEntity>();
  private playerCityBuildings: ReadonlyArray<PlayerCityDistrictView> = [];
  private districtsEntity: PlayerCityDistrictsEntity | null = null;
  private selectionObjects: Phaser.GameObjects.GameObject[] = [];
  private selectionDetailObjects: Phaser.GameObjects.GameObject[] = [];
  private lastCameraState: MapCameraState | null = null;
  private lastAmbientSignature: string | null = null;
  private lastObjectLayerSignature: string | null = null;
  private lastRouteSnapshot: RouteLayerSnapshot | null = null;
  private lastSelectionDetailSignature: string | null = null;
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
  private cameraZoomTweenTarget: { zoom: number; scrollX: number; scrollY: number } | null = null;
  private reducedMotion = false;

  constructor() {
    super("frontier-map");
  }

  preload() {
    const spriteSize = { width: 40, height: 40 } as const;
    this.load.svg(
      "poi-camp-barbarian",
      "/assets/icons/map/poi_camp_barbarian.svg",
      spriteSize,
    );
    this.load.svg("poi-node-wood", "/assets/icons/resources/wood.svg", spriteSize);
    this.load.svg("poi-node-stone", "/assets/icons/resources/stone.svg", spriteSize);
    this.load.svg("poi-node-food", "/assets/icons/resources/food.svg", spriteSize);
    this.load.svg("poi-node-gold", "/assets/icons/resources/gold.svg", spriteSize);
    this.load.svg("march-soldier", "/assets/icons/map/march_soldier.svg", {
      width: 18,
      height: 18,
    });
    this.load.svg("city-marker", "/assets/icons/map/city_marker.svg", {
      width: 44,
      height: 44,
    });
    this.load.svg("alliance-marker", "/assets/icons/map/alliance_marker.svg", {
      width: 40,
      height: 40,
    });
    this.load.svg("scout-runner", "/assets/icons/map/scout_runner.svg", {
      width: 18,
      height: 18,
    });
    for (const [type, path] of Object.entries(BUILDING_ICONS) as [BuildingType, string][]) {
      this.load.svg(`building-${type.toLowerCase()}`, path, { width: 24, height: 24 });
    }
  }

  create() {
    this.cameras.main.setBackgroundColor("#081319");
    this.reducedMotion =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    this.input.mouse?.disableContextMenu();
    this.terrainLayer = this.add.layer();
    this.ambientLayer = this.add.layer();
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
    this.syncSelectionDetails();
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
      this.syncSelectionDetails();
      this.syncSelectionFx();
    }

    this.updateRouteLayer();
    this.updateAmbientMotes();
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
    this.playerCityBuildings = config.playerCityBuildings;
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
    this.syncSelectionDetails();
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
    this.zoomAroundViewportCenter(this.cameras.main.zoom * 1.18);
  }

  zoomOut() {
    if (!this.isCameraReady()) {
      return;
    }
    this.zoomAroundViewportCenter(this.cameras.main.zoom / 1.18);
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
    this.spawnFocusBeacon(point.x, point.y, 0xf4d79c, 18);
    this.cameras.main.pan(point.x, point.y, duration, "Cubic.easeOut", true);
  }

  projectTileToViewport(x: number, y: number) {
    if (!this.isCameraReady()) {
      return null;
    }

    const camera = this.cameras.main;
    const worldPoint = tileToWorld(x, y);
    const canvasX = (worldPoint.x - camera.scrollX) * camera.zoom;
    const canvasY = (worldPoint.y - camera.scrollY) * camera.zoom;
    const centerWorldX = camera.scrollX + this.scale.width / (2 * camera.zoom);
    const centerWorldY = camera.scrollY + this.scale.height / (2 * camera.zoom);
    const centerTile = worldToTile(centerWorldX, centerWorldY, this.worldSize);

    return {
      worldX: Number(worldPoint.x.toFixed(2)),
      worldY: Number(worldPoint.y.toFixed(2)),
      canvasX: Number(canvasX.toFixed(2)),
      canvasY: Number(canvasY.toFixed(2)),
      withinViewport: canvasX >= 0 && canvasX <= this.scale.width && canvasY >= 0 && canvasY <= this.scale.height,
      viewport: {
        width: this.scale.width,
        height: this.scale.height,
      },
      camera: {
        scrollX: Number(camera.scrollX.toFixed(2)),
        scrollY: Number(camera.scrollY.toFixed(2)),
        zoom: Number(camera.zoom.toFixed(2)),
        centerWorldX: Number(centerWorldX.toFixed(2)),
        centerWorldY: Number(centerWorldY.toFixed(2)),
        centerTileX: centerTile.x,
        centerTileY: centerTile.y,
      },
    };
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
      this.zoomAroundScreenPoint(pointer.x, pointer.y, this.cameras.main.zoom * Math.pow(1.0018, -dy));
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
    if (Math.abs(clampedZoom - camera.zoom) < 0.001) {
      return;
    }

    const worldBefore = camera.getWorldPoint(screenX, screenY);
    const targetScroll = this.getBoundedScrollForZoom(
      worldBefore.x - screenX / clampedZoom,
      worldBefore.y - screenY / clampedZoom,
      clampedZoom,
    );

    this.cameraDrift.x = 0;
    this.cameraDrift.y = 0;
    this.animateCameraZoom(camera, clampedZoom, targetScroll.x, targetScroll.y);
  }

  private animateCameraZoom(
    camera: Phaser.Cameras.Scene2D.Camera,
    targetZoom: number,
    targetScrollX: number,
    targetScrollY: number,
  ) {
    if (this.cameraZoomTweenTarget) {
      this.tweens.killTweensOf(this.cameraZoomTweenTarget);
      this.cameraZoomTweenTarget = null;
    }

    if (this.reducedMotion) {
      camera.setZoom(targetZoom);
      this.clampAndSetCameraScroll(targetScrollX, targetScrollY);
      this.emitCameraState(true);
      return;
    }

    const tweenTarget = {
      zoom: camera.zoom,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
    };
    this.cameraZoomTweenTarget = tweenTarget;

    this.tweens.add({
      targets: tweenTarget,
      zoom: targetZoom,
      scrollX: targetScrollX,
      scrollY: targetScrollY,
      duration: 220,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        camera.setZoom(tweenTarget.zoom);
        this.clampAndSetCameraScroll(tweenTarget.scrollX, tweenTarget.scrollY);
      },
      onComplete: () => {
        camera.setZoom(targetZoom);
        this.clampAndSetCameraScroll(targetScrollX, targetScrollY);
        if (this.cameraZoomTweenTarget === tweenTarget) {
          this.cameraZoomTweenTarget = null;
        }
        this.emitCameraState(true);
      },
    });
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
    const { x, y } = this.getBoundedScrollForZoom(nextScrollX, nextScrollY, camera.zoom);
    camera.setScroll(x, y);
  }

  private getBoundedScrollForZoom(nextScrollX: number, nextScrollY: number, zoom: number) {
    const visibleWidth = this.scale.width / zoom;
    const visibleHeight = this.scale.height / zoom;
    const maxScrollX = Math.max(0, this.worldPixelSize - visibleWidth);
    const maxScrollY = Math.max(0, this.worldPixelSize - visibleHeight);
    return {
      x: clampNumber(nextScrollX, 0, maxScrollX),
      y: clampNumber(nextScrollY, 0, maxScrollY),
    };
  }

  private syncTerrainLayer() {
    if (!this.terrainGraphics || !this.gridGraphics) {
      return;
    }

    this.terrainGraphics.clear();
    this.gridGraphics.clear();
    this.terrainGraphics.fillStyle(0x101216, 1);
    this.terrainGraphics.fillRect(0, 0, this.worldPixelSize, this.worldPixelSize);
    const sanctuaryTiles = new Set(getKingdomSanctuaries(this.worldSize).map((entry) => `${entry.x}:${entry.y}`));

    for (const tile of this.tiles) {
      const x = tile.x * MAP_TILE_WORLD_SIZE;
      const y = tile.y * MAP_TILE_WORLD_SIZE;
      const terrainAlpha = tile.state === "VISIBLE" ? 0.98 : tile.state === "DISCOVERED" ? 0.92 : 1;
      this.terrainGraphics.fillStyle(getTerrainFill(tile, this.worldSize), terrainAlpha);
      this.terrainGraphics.fillRect(x, y, MAP_TILE_WORLD_SIZE, MAP_TILE_WORLD_SIZE);

      const decoration = hashCoordinate(tile.x, tile.y) % 5;
      if (tile.state !== "HIDDEN" && decoration <= 2) {
        const tier = getKingdomTier(tile.x, tile.y, this.worldSize);
        this.terrainGraphics.fillStyle(tier.fill, tile.state === "VISIBLE" ? 0.2 : 0.11);
        this.terrainGraphics.fillCircle(x + 28 + decoration * 10, y + 26 + decoration * 8, 8 + decoration * 2);
      }

      if (tile.state === "HIDDEN") {
        const fogHash = hashCoordinate(tile.x + 5, tile.y + 13);
        this.terrainGraphics.fillStyle(0x9aa6a8, 0.035);
        this.terrainGraphics.fillCircle(x + 30 + (fogHash % 58), y + 22 + (Math.floor(fogHash / 17) % 70), 24);
        this.terrainGraphics.fillStyle(0x000000, 0.18);
        this.terrainGraphics.fillRect(x, y, MAP_TILE_WORLD_SIZE, MAP_TILE_WORLD_SIZE);
      }

      const pass = getNearestKingdomPass(tile.x, tile.y, this.worldSize, 0.72);
      if (pass) {
        this.drawPassTile(tile, pass.x, pass.y);
      } else if (isKingdomMountainTile(tile.x, tile.y, this.worldSize)) {
        this.drawMountainTile(tile);
      }

      if (sanctuaryTiles.has(`${tile.x}:${tile.y}`)) {
        this.drawSanctuaryTile(tile);
      }
    }

    this.drawKingdomBoundaryRings();

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

    this.syncAmbientMotes();
  }

  private drawMountainTile(tile: FogTileView) {
    if (!this.terrainGraphics) {
      return;
    }

    const x = tile.x * MAP_TILE_WORLD_SIZE;
    const y = tile.y * MAP_TILE_WORLD_SIZE;
    const hash = hashCoordinate(tile.x + 29, tile.y + 47);
    const alpha = tile.state === "HIDDEN" ? 0.32 : tile.state === "DISCOVERED" ? 0.58 : 0.78;
    const ridgeColor = tile.state === "HIDDEN" ? 0x3d4142 : MAP_COLOR_MOUNTAIN;
    const peakA = 36 + (hash % 10);
    const peakB = 76 + (Math.floor(hash / 13) % 12);

    this.terrainGraphics.fillStyle(MAP_COLOR_MOUNTAIN_SHADOW, alpha * 0.42);
    this.terrainGraphics.fillTriangle(x + 18, y + 94, x + peakA + 7, y + 40, x + 76, y + 98);
    this.terrainGraphics.fillTriangle(x + 54, y + 96, x + peakB, y + 32, x + 112, y + 98);
    this.terrainGraphics.fillStyle(ridgeColor, alpha);
    this.terrainGraphics.fillTriangle(x + 12, y + 88, x + peakA, y + 30, x + 72, y + 88);
    this.terrainGraphics.fillTriangle(x + 48, y + 90, x + peakB, y + 24, x + 116, y + 90);
    this.terrainGraphics.fillStyle(MAP_COLOR_REPORT, alpha * 0.18);
    this.terrainGraphics.fillTriangle(x + peakA - 5, y + 40, x + peakA, y + 30, x + peakA + 7, y + 42);
    this.terrainGraphics.fillTriangle(x + peakB - 6, y + 36, x + peakB, y + 24, x + peakB + 8, y + 38);
  }

  private drawPassTile(tile: FogTileView, passX: number, passY: number) {
    if (!this.terrainGraphics) {
      return;
    }

    const x = tile.x * MAP_TILE_WORLD_SIZE;
    const y = tile.y * MAP_TILE_WORLD_SIZE;
    const alpha = tile.state === "HIDDEN" ? 0.22 : tile.state === "DISCOVERED" ? 0.55 : 0.82;
    const isCenter = tile.x === passX && tile.y === passY;

    this.terrainGraphics.fillStyle(0x18110c, alpha * 0.66);
    this.terrainGraphics.fillRect(x + 18, y + 50, 92, 28);
    this.terrainGraphics.fillStyle(MAP_COLOR_PASS, alpha);
    this.terrainGraphics.fillRect(x + 24, y + 58, 80, 12);
    this.terrainGraphics.fillCircle(x + 24, y + 64, 6);
    this.terrainGraphics.fillCircle(x + 104, y + 64, 6);
    if (isCenter && this.currentDetailLevel !== "far") {
      this.terrainGraphics.lineStyle(2, MAP_COLOR_PASS, alpha * 0.72);
      this.terrainGraphics.strokeRect(x + 28, y + 40, 72, 48);
    }
  }

  private drawSanctuaryTile(tile: FogTileView) {
    if (!this.terrainGraphics) {
      return;
    }

    const x = tile.x * MAP_TILE_WORLD_SIZE;
    const y = tile.y * MAP_TILE_WORLD_SIZE;
    const alpha = tile.state === "HIDDEN" ? 0.18 : tile.state === "DISCOVERED" ? 0.5 : 0.78;

    this.terrainGraphics.fillStyle(MAP_COLOR_TEMPLE, alpha * 0.16);
    this.terrainGraphics.fillCircle(x + 64, y + 64, 48);
    this.terrainGraphics.lineStyle(2, MAP_COLOR_TEMPLE, alpha * 0.58);
    this.terrainGraphics.strokeCircle(x + 64, y + 64, 34);
    this.terrainGraphics.fillStyle(MAP_COLOR_PASS, alpha);
    this.terrainGraphics.fillTriangle(x + 64, y + 30, x + 42, y + 78, x + 86, y + 78);
    this.terrainGraphics.fillStyle(0x23170f, alpha * 0.72);
    this.terrainGraphics.fillRect(x + 52, y + 70, 24, 22);
  }

  private drawKingdomBoundaryRings() {
    if (!this.gridGraphics) {
      return;
    }

    const center = (this.worldSize * MAP_TILE_WORLD_SIZE) / 2;
    const radii = getKingdomRingRadii(this.worldSize);
    const innerRadius = radii.inner * MAP_TILE_WORLD_SIZE;
    const outerRadius = radii.outer * MAP_TILE_WORLD_SIZE;
    const alpha = this.currentDetailLevel === "near" ? 0.18 : this.currentDetailLevel === "mid" ? 0.24 : 0.3;

    this.gridGraphics.lineStyle(3, 0xa888d8, alpha);
    this.gridGraphics.strokeCircle(center, center, innerRadius);
    this.gridGraphics.lineStyle(3, 0x6ca7d8, alpha * 0.9);
    this.gridGraphics.strokeCircle(center, center, outerRadius);
  }

  private syncAmbientMotes() {
    const signature = [
      this.currentDetailLevel,
      this.worldSize,
      this.tiles.map((tile) => `${tile.x},${tile.y},${tile.state}`).join("|"),
    ].join(";");

    if (signature === this.lastAmbientSignature) {
      return;
    }

    this.lastAmbientSignature = signature;
    this.clearAmbientMotes();

    if (!this.ambientLayer || this.reducedMotion || this.currentDetailLevel === "far") {
      return;
    }

    const maxMotes = this.currentDetailLevel === "near" ? 38 : 24;
    const candidates = this.tiles
      .filter((tile) => tile.state !== "HIDDEN")
      .map((tile) => ({
        tile,
        score: hashCoordinate(tile.x + 17, tile.y + 29),
      }))
      .filter(({ score }) => score % 3 !== 0)
      .sort((left, right) => left.score - right.score)
      .slice(0, maxMotes);

    for (const { tile, score } of candidates) {
      const localRange = MAP_TILE_WORLD_SIZE - 36;
      const baseX = tile.x * MAP_TILE_WORLD_SIZE + 18 + (score % localRange);
      const baseY = tile.y * MAP_TILE_WORLD_SIZE + 18 + (Math.floor(score / 97) % localRange);
      const radius = tile.state === "VISIBLE" ? 2.2 + (score % 3) * 0.45 : 1.8;
      const color =
        tile.state === "VISIBLE"
          ? score % 5 === 0
            ? MAP_COLOR_NEUTRAL
            : score % 2 === 0
              ? MAP_COLOR_ALLIED
              : 0x83b982
          : 0x5f7169;
      const glow = this.add.circle(baseX, baseY, radius * 4.2, color, tile.state === "VISIBLE" ? 0.06 : 0.035);
      const body = this.add.circle(baseX, baseY, radius, color, tile.state === "VISIBLE" ? 0.36 : 0.22);
      this.ambientLayer.add([glow, body]);
      this.ambientMotes.push({
        glow,
        body,
        baseX,
        baseY,
        driftX: 5 + (score % 7),
        driftY: 4 + (Math.floor(score / 11) % 6),
        radius,
        seed: score % 1000,
        speed: 980 + (score % 900),
      });
    }
  }

  private clearAmbientMotes() {
    for (const mote of this.ambientMotes) {
      mote.glow.destroy();
      mote.body.destroy();
    }
    this.ambientMotes = [];
  }

  private updateAmbientMotes() {
    if (this.ambientMotes.length === 0 || this.reducedMotion) {
      return;
    }

    for (const mote of this.ambientMotes) {
      const phase = this.time.now / mote.speed + mote.seed;
      const x = mote.baseX + Math.sin(phase) * mote.driftX;
      const y = mote.baseY + Math.cos(phase * 0.78) * mote.driftY;
      const shimmer = 0.5 + Math.sin(phase * 1.7) * 0.5;
      const bodyAlpha = 0.18 + shimmer * 0.28;
      const glowAlpha = 0.025 + shimmer * 0.055;
      const scale = 0.82 + shimmer * 0.42;
      mote.body.setPosition(x, y);
      mote.glow.setPosition(x, y);
      mote.body.setAlpha(bodyAlpha);
      mote.glow.setAlpha(glowAlpha);
      mote.body.setScale(scale);
      mote.glow.setScale(0.9 + shimmer * 0.38);
    }
  }

  private syncObjectLayer() {
    const nextSignature = this.getObjectLayerSignature();
    if (nextSignature === this.lastObjectLayerSignature) {
      return;
    }

    this.prepareStaticGraphics();
    this.cityLookup.clear();
    this.poiLookup.clear();
    this.reportLookup.clear();

    if (!this.objectLayer || !this.uiLayer) {
      return;
    }

    this.lastObjectLayerSignature = nextSignature;
    this.prepareStaticLabels();

    const showLabels = this.currentDetailLevel !== "far";
    const showNearDetail = this.currentDetailLevel === "near";

    if (this.currentDetailLevel !== "near") {
      for (const region of getWorldRegions(this.worldSize)) {
        const regionLabel = this.getOrCreateStaticLabel(
          `region:${region.id}`,
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
          0.5,
          0.5,
        );
        regionLabel.setAlpha(this.currentDetailLevel === "far" ? 0.18 : 0.24);
      }
    }

    this.syncKingdomStrategicLabels(showLabels, showNearDetail);

    for (const marker of this.allianceMarkers) {
      const point = tileToWorld(marker.x, marker.y);
      const markerBundle = this.activateStaticBundle(
        this.getOrCreateAllianceMarkerGraphicBundle(`alliance-marker-graphics:${marker.id}`),
        point.x,
        point.y,
        hashCoordinate(marker.x, marker.y),
      );
      markerBundle.beacon.setRadius(this.currentDetailLevel === "far" ? 18 : 24);
      this.addAmbientPulse(markerBundle.beacon, {
        minScale: 0.96,
        maxScale: this.currentDetailLevel === "far" ? 1.06 : 1.12,
        minAlpha: 0.05,
        maxAlpha: 0.16,
        duration: 1800 + (hashCoordinate(marker.x, marker.y) % 5) * 190,
      });
      this.addAmbientPulse(markerBundle.sprite, {
        minScale: 0.94,
        maxScale: 1.02,
        minAlpha: 0.88,
        maxAlpha: 1,
        duration: 2200 + (hashCoordinate(marker.x + 5, marker.y) % 5) * 180,
      });

      if (showLabels) {
        const label = this.getOrCreateStaticLabel(
          `alliance-marker:${marker.id}`,
          point.x,
          point.y + 20,
          marker.label,
          {
            color: "#dff9fb",
            fontFamily: "'Inter', sans-serif",
            fontSize: showNearDetail ? "12px" : "10px",
            backgroundColor: "rgba(7, 22, 26, 0.72)",
            padding: { x: 6, y: 3 },
          },
          0.5,
          0,
        );
        this.addLabelFloat(label, point.y + 20, hashCoordinate(marker.x + 3, marker.y + 7));
      }
    }

    if (this.showReports) {
      for (const report of this.reportMarkers) {
        const point = tileToWorld(report.x, report.y);
        this.reportLookup.set(report.id, { worldX: point.x, worldY: point.y, data: report });
        const bubbleColor =
          report.resultTone === "success" ? 0x4fb07d : report.resultTone === "warning" ? MAP_COLOR_HOSTILE : 0x5e9fcb;
        const reportBundle = this.activateStaticBundle(
          this.getOrCreateReportGraphicBundle(`report-graphics:${report.id}`),
          point.x,
          point.y,
          hashCoordinate(report.x, report.y),
        );
        reportBundle.bubble.setRadius(this.currentDetailLevel === "far" ? 10 : 12);
        reportBundle.bubble.setFillStyle(bubbleColor, 0.92);
        reportBundle.ping.setRadius(this.currentDetailLevel === "far" ? 14 : 18);
        reportBundle.ping.setFillStyle(bubbleColor, 0.08);
        const glyph = this.getOrCreateStaticLabel(
          `report-glyph:${report.id}`,
          point.x,
          point.y - 18,
          report.kind === "RESOURCE_GATHER" ? "G" : report.kind === "BARBARIAN_BATTLE" ? "B" : "R",
          {
            color: "#f8f0dd",
            fontFamily: "'Inter', sans-serif",
            fontSize: this.currentDetailLevel === "far" ? "10px" : "11px",
            fontStyle: "700",
          },
          0.5,
          0.5,
        );
        this.addAmbientPulse(reportBundle.ping, {
          minScale: 0.96,
          maxScale: 1.12,
          minAlpha: 0.03,
          maxAlpha: 0.12,
          duration: 2200 + (hashCoordinate(report.x, report.y) % 5) * 120,
        });

        if (showLabels && this.currentDetailLevel !== "far") {
          const label = this.getOrCreateStaticLabel(
            `report-label:${report.id}`,
            point.x,
            point.y - 40,
            report.label,
            {
              color: "#f8f0dd",
              fontFamily: "'Inter', sans-serif",
              fontSize: showNearDetail ? "11px" : "10px",
              backgroundColor: "rgba(20, 13, 11, 0.58)",
              padding: { x: 5, y: 3 },
            },
            0.5,
            1,
          );
          label.setAlpha(0.98);
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
      if (poi.kind === "BARBARIAN_CAMP") {
        const poiBundle = this.activateStaticBundle(
          this.getOrCreatePoiCampGraphicBundle(`poi-graphics:${poi.id}:${poi.kind}`),
          point.x,
          point.y,
          hashCoordinate(poi.x, poi.y),
        );
        poiBundle.aura.setFillStyle(baseColor, poi.state === "ACTIVE" ? 0.14 : 0.08);
        this.addAmbientPulse(poiBundle.aura, {
          minScale: 0.96,
          maxScale: 1.18,
          minAlpha: poi.state === "ACTIVE" ? 0.08 : 0.04,
          maxAlpha: poi.state === "ACTIVE" ? 0.2 : 0.1,
          duration: 1800 + (hashCoordinate(poi.x, poi.y) % 5) * 220,
        });
        this.addAmbientPulse(poiBundle.sprite, {
          minScale: 0.94,
          maxScale: 1.02,
          minAlpha: poi.state === "ACTIVE" ? 0.85 : 0.55,
          maxAlpha: poi.state === "ACTIVE" ? 1 : 0.78,
          duration: 2000 + (hashCoordinate(poi.x + 7, poi.y) % 5) * 180,
        });
      } else {
        const poiBundle = this.activateStaticBundle(
          this.getOrCreatePoiNodeGraphicBundle(`poi-graphics:${poi.id}:${poi.kind}`),
          point.x,
          point.y,
          hashCoordinate(poi.x, poi.y),
        );
        poiBundle.aura.setFillStyle(baseColor, poi.state === "ACTIVE" ? 0.14 : 0.08);
        poiBundle.sprite.setTexture(this.poiNodeTextureKey(poi.resourceType));
        this.addAmbientPulse(poiBundle.aura, {
          minScale: 0.96,
          maxScale: 1.1,
          minAlpha: poi.state === "ACTIVE" ? 0.08 : 0.04,
          maxAlpha: poi.state === "ACTIVE" ? 0.2 : 0.1,
          duration: 1800 + (hashCoordinate(poi.x, poi.y) % 5) * 220,
        });
        this.addAmbientPulse(poiBundle.sprite, {
          minScale: 0.94,
          maxScale: 1.02,
          minAlpha: poi.state === "ACTIVE" ? 0.92 : 0.6,
          maxAlpha: poi.state === "ACTIVE" ? 1 : 0.82,
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

        const label = this.getOrCreateStaticLabel(
          `poi:${poi.id}`,
          point.x,
          point.y + 26,
          `${poi.label}\n${lineTwo}`,
          {
            color: "#f8f0dd",
            fontFamily: "'Cinzel', 'Palatino Linotype', serif",
            fontSize: showNearDetail ? "13px" : "11px",
            align: "center",
            backgroundColor: "rgba(20, 13, 11, 0.5)",
            padding: { x: 6, y: 4 },
          },
          0.5,
          0,
        );
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
      const allied = !city.isCurrentPlayer && this.alliedOwnerNames.has(city.ownerName);
      const auraColor = city.isCurrentPlayer ? MAP_COLOR_HOME : allied ? 0x5c8a99 : city.fogState === "VISIBLE" ? 0x8a2c2c : 0x555558;
      const cityColor = city.isCurrentPlayer ? 0xd4af37 : allied ? 0x4aa7b5 : city.fogState === "VISIBLE" ? 0xa54842 : 0x737376;
      const cityBundle = this.activateStaticBundle(
        this.getOrCreateCityGraphicBundle(`city-graphics:${city.cityId}`),
        point.x,
        point.y,
        hashCoordinate(city.x, city.y),
      );
      cityBundle.territory.setVisible(allied);
      cityBundle.territory.setActive(allied);
      cityBundle.territory.setRadius(this.currentDetailLevel === "near" ? 72 : 64);
      cityBundle.aura.setFillStyle(auraColor, city.isCurrentPlayer ? 0.18 : 0.12);
      cityBundle.sprite.setTint(cityColor);
      if (allied) {
        this.addAmbientPulse(cityBundle.territory, {
          minScale: 0.98,
          maxScale: 1.1,
          minAlpha: 0.03,
          maxAlpha: 0.1,
          duration: 2400 + (hashCoordinate(city.x, city.y + 13) % 5) * 180,
        });
      }
      this.addAmbientPulse(cityBundle.aura, {
        minScale: 0.96,
        maxScale: city.isCurrentPlayer ? 1.2 : 1.12,
        minAlpha: city.isCurrentPlayer ? 0.1 : 0.06,
        maxAlpha: city.isCurrentPlayer ? 0.22 : 0.16,
        duration: 2100 + (hashCoordinate(city.x, city.y) % 5) * 180,
      });
      this.addAmbientPulse(cityBundle.sprite, {
        minScale: 0.96,
        maxScale: 1.04,
        minAlpha: 0.92,
        maxAlpha: 1,
        duration: 1700 + (hashCoordinate(city.x + 11, city.y) % 5) * 160,
      });

      if (showLabels) {
        const label = this.getOrCreateStaticLabel(
          `city:${city.cityId}`,
          point.x,
          point.y - 30,
          city.isCurrentPlayer ? "You" : allied && this.allianceTag ? `[${this.allianceTag}] ${city.cityName}` : city.cityName,
          {
            color: "#f8f0dd",
            fontFamily: "'Cinzel', 'Palatino Linotype', serif",
            fontSize: showNearDetail ? "14px" : "11px",
            align: "center",
            backgroundColor: "rgba(20, 13, 11, 0.5)",
            padding: { x: 6, y: 3 },
          },
          0.5,
          1,
        );
        this.addLabelFloat(label, point.y - 30, hashCoordinate(city.x, city.y));
      }
    }

    this.syncPlayerCityDistricts();
  }

  private syncPlayerCityDistricts() {
    const playerCity = this.cities.find((entry) => entry.isCurrentPlayer);
    const shouldShow =
      playerCity != null &&
      this.currentDetailLevel === "near" &&
      this.playerCityBuildings.length > 0 &&
      playerCity.fogState === "VISIBLE";

    if (!shouldShow) {
      if (this.districtsEntity) {
        this.districtsEntity.container.setVisible(false);
        this.districtsEntity.container.setActive(false);
      }
      return;
    }

    const point = tileToWorld(playerCity.x, playerCity.y);
    let entity = this.districtsEntity;
    if (!entity) {
      const container = this.add.container(point.x, point.y);
      this.objectLayer?.add(container);
      entity = {
        container,
        sprites: new Map<BuildingType, Phaser.GameObjects.Image>(),
        centerWorldX: point.x,
        centerWorldY: point.y,
      };
      this.districtsEntity = entity;
    } else {
      entity.container.setPosition(point.x, point.y);
      entity.centerWorldX = point.x;
      entity.centerWorldY = point.y;
    }
    entity.container.setVisible(true);
    entity.container.setActive(true);

    const radius = 64;
    const slots = Math.max(this.playerCityBuildings.length, 1);
    const seenTypes = new Set<BuildingType>();

    this.playerCityBuildings.forEach((building, index) => {
      seenTypes.add(building.type);
      const angle = -Math.PI / 2 + (index / slots) * Math.PI * 2;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      let sprite = entity!.sprites.get(building.type);
      const textureKey = `building-${building.type.toLowerCase()}`;
      if (!sprite) {
        sprite = this.add.image(offsetX, offsetY, textureKey).setOrigin(0.5, 0.5);
        entity!.container.add(sprite);
        entity!.sprites.set(building.type, sprite);
      } else {
        sprite.setPosition(offsetX, offsetY);
        sprite.setVisible(true);
        sprite.setActive(true);
      }
      sprite.setAlpha(0.92);
    });

    for (const [type, sprite] of entity.sprites) {
      if (!seenTypes.has(type)) {
        sprite.setVisible(false);
        sprite.setActive(false);
      }
    }
  }

  private syncKingdomStrategicLabels(showLabels: boolean, showNearDetail: boolean) {
    const centerTile = Math.floor(this.worldSize / 2);
    const tierLabels = [
      {
        id: "tier-3",
        label: "TIER 3\nCROWN CORE",
        x: centerTile,
        y: Math.max(2, centerTile - 9),
        color: "#d7b4ff",
        alpha: this.currentDetailLevel === "far" ? 0.24 : 0.38,
      },
      {
        id: "tier-2",
        label: "TIER 2\nGATE BELT",
        x: centerTile,
        y: Math.max(2, centerTile - 19),
        color: "#9fd2ff",
        alpha: this.currentDetailLevel === "far" ? 0.2 : 0.32,
      },
      {
        id: "tier-1",
        label: "TIER 1\nOUTER PROVINCES",
        x: Math.max(3, Math.floor(this.worldSize * 0.22)),
        y: Math.max(3, Math.floor(this.worldSize * 0.16)),
        color: "#9eddb0",
        alpha: this.currentDetailLevel === "far" ? 0.2 : 0.28,
      },
    ];

    for (const tier of tierLabels) {
      const point = tileToWorld(tier.x, tier.y);
      const label = this.getOrCreateStaticLabel(
        `kingdom-tier:${tier.id}`,
        point.x,
        point.y,
        tier.label,
        {
          color: tier.color,
          fontFamily: "'Cinzel', 'Palatino Linotype', serif",
          fontSize: this.currentDetailLevel === "far" ? "16px" : "19px",
          fontStyle: "700",
          align: "center",
          stroke: "#120b08",
          strokeThickness: 4,
        },
        0.5,
        0.5,
      );
      label.setAlpha(tier.alpha);
    }

    const sanctuaries = getKingdomSanctuaries(this.worldSize);
    for (const sanctuary of sanctuaries) {
      if (!showLabels && sanctuary.id !== "crown-temple") {
        continue;
      }
      const point = tileToWorld(sanctuary.x, sanctuary.y);
      const glyph = this.getOrCreateStaticLabel(
        `sanctuary-glyph:${sanctuary.id}`,
        point.x,
        point.y - 10,
        sanctuary.id === "crown-temple" ? "C" : "A",
        {
          color: sanctuary.color,
          fontFamily: "'Cinzel', 'Palatino Linotype', serif",
          fontSize: showNearDetail ? "17px" : "13px",
          fontStyle: "700",
          backgroundColor: "rgba(20, 13, 11, 0.58)",
          padding: { x: 5, y: 2 },
        },
        0.5,
        0.5,
      );
      glyph.setAlpha(showLabels ? 0.92 : 0.38);

      if (showLabels) {
        const label = this.getOrCreateStaticLabel(
          `sanctuary-label:${sanctuary.id}`,
          point.x,
          point.y + 24,
          sanctuary.label,
          {
            color: "#f8f0dd",
            fontFamily: "'Inter', sans-serif",
            fontSize: showNearDetail ? "11px" : "10px",
            backgroundColor: "rgba(20, 13, 11, 0.5)",
            padding: { x: 5, y: 3 },
          },
          0.5,
          0,
        );
        label.setAlpha(sanctuary.id === "crown-temple" ? 0.98 : 0.82);
      }
    }

    if (!showLabels) {
      return;
    }

    for (const pass of getKingdomPasses(this.worldSize)) {
      if (!showNearDetail && pass.tier === "TIER_2" && hashCoordinate(pass.x, pass.y) % 2 === 0) {
        continue;
      }

      const point = tileToWorld(pass.x, pass.y);
      const passColor = pass.tier === "TIER_3" ? "#d7b4ff" : "#9fd2ff";
      const label = this.getOrCreateStaticLabel(
        `kingdom-pass:${pass.id}`,
        point.x,
        point.y - 38,
        pass.tier === "TIER_3" ? "Crown Pass" : "Gate Pass",
        {
          color: passColor,
          fontFamily: "'Inter', sans-serif",
          fontSize: showNearDetail ? "10px" : "9px",
          backgroundColor: "rgba(11, 14, 18, 0.62)",
          padding: { x: 5, y: 2 },
        },
        0.5,
        1,
      );
      label.setAlpha(pass.tier === "TIER_3" ? 0.9 : 0.72);
    }
  }

  private prepareStaticGraphics() {
    for (const bundle of this.staticGraphicCache.values()) {
      this.tweens.killTweensOf(bundle.container);
      bundle.container.setVisible(false);
      bundle.container.setActive(false);
      for (const child of bundle.container.list) {
        this.tweens.killTweensOf(child);
        const toggleableChild = child as ToggleableGameObject;
        toggleableChild.setVisible(false);
        toggleableChild.setActive(false);
      }
    }
  }

  private activateStaticBundle<T extends StaticGraphicBundle>(bundle: T, x: number, y: number, revealHash = 0) {
    bundle.container.setPosition(x, y);
    bundle.container.setVisible(true);
    bundle.container.setActive(true);
    bundle.container.setAlpha(1);
    bundle.container.setScale(1);
    for (const child of bundle.container.list) {
      const toggleableChild = child as ToggleableGameObject;
      toggleableChild.setVisible(true);
      toggleableChild.setActive(true);
    }
    this.animateStaticReveal(bundle.container, revealHash);
    return bundle;
  }

  private animateStaticReveal(container: Phaser.GameObjects.Container, revealHash: number) {
    if (this.reducedMotion || this.currentDetailLevel === "far") {
      return;
    }

    const delay = (revealHash % 7) * 24;
    container.setAlpha(0);
    container.setScale(0.82);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1,
      delay,
      duration: 360,
      ease: "Back.easeOut",
    });
  }

  private getOrCreateAllianceMarkerGraphicBundle(key: string) {
    const existing = this.staticGraphicCache.get(key);
    if (existing?.kind === "alliance-marker") {
      return existing;
    }

    const container = this.add.container(0, 0);
    const beacon = this.add.circle(0, 0, 24, 0x53c8d2, 0.14);
    const sprite = this.add.image(0, 0, "alliance-marker").setOrigin(0.5, 0.7);
    container.add([beacon, sprite]);
    this.objectLayer?.add(container);

    const bundle: AllianceMarkerGraphicBundle = {
      kind: "alliance-marker",
      container,
      beacon,
      sprite,
    };
    this.staticGraphicCache.set(key, bundle);
    return bundle;
  }

  private getOrCreateReportGraphicBundle(key: string) {
    const existing = this.staticGraphicCache.get(key);
    if (existing?.kind === "report") {
      return existing;
    }

    const container = this.add.container(0, 0);
    const ping = this.add.circle(0, -18, 18, MAP_COLOR_REPORT, 0.08);
    const bubble = this.add.circle(0, -18, 12, MAP_COLOR_REPORT, 0.92);
    container.add([ping, bubble]);
    this.objectLayer?.add(container);

    const bundle: ReportGraphicBundle = {
      kind: "report",
      container,
      ping,
      bubble,
    };
    this.staticGraphicCache.set(key, bundle);
    return bundle;
  }

  private getOrCreatePoiCampGraphicBundle(key: string) {
    const existing = this.staticGraphicCache.get(key);
    if (existing?.kind === "poi-camp") {
      return existing;
    }

    const container = this.add.container(0, 0);
    const aura = this.add.circle(0, 0, 34, MAP_COLOR_HOSTILE, 0.14);
    const sprite = this.add.image(0, 0, "poi-camp-barbarian").setOrigin(0.5, 0.5);
    container.add([aura, sprite]);
    this.objectLayer?.add(container);

    const bundle: PoiCampGraphicBundle = {
      kind: "poi-camp",
      container,
      aura,
      sprite,
    };
    this.staticGraphicCache.set(key, bundle);
    return bundle;
  }

  private getOrCreatePoiNodeGraphicBundle(key: string) {
    const existing = this.staticGraphicCache.get(key);
    if (existing?.kind === "poi-node") {
      return existing;
    }

    const container = this.add.container(0, 0);
    const aura = this.add.circle(0, 0, 34, MAP_COLOR_GATHER, 0.14);
    const sprite = this.add.image(0, 0, "poi-node-wood").setOrigin(0.5, 0.5);
    container.add([aura, sprite]);
    this.objectLayer?.add(container);

    const bundle: PoiNodeGraphicBundle = {
      kind: "poi-node",
      container,
      aura,
      sprite,
    };
    this.staticGraphicCache.set(key, bundle);
    return bundle;
  }

  private poiNodeTextureKey(resourceType: PoiView["resourceType"]) {
    switch (resourceType) {
      case "STONE":
        return "poi-node-stone";
      case "FOOD":
        return "poi-node-food";
      case "GOLD":
        return "poi-node-gold";
      case "WOOD":
      default:
        return "poi-node-wood";
    }
  }

  private getOrCreateCityGraphicBundle(key: string) {
    const existing = this.staticGraphicCache.get(key);
    if (existing?.kind === "city") {
      return existing;
    }

    const container = this.add.container(0, 0);
    const territory = this.add.circle(0, 0, 64, MAP_COLOR_ALLIED_TERRITORY, 0.08);
    const aura = this.add.circle(0, 0, 38, MAP_COLOR_HOME, 0.18);
    const sprite = this.add.image(0, 0, "city-marker").setOrigin(0.5, 0.55);
    container.add([territory, aura, sprite]);
    this.objectLayer?.add(container);

    const bundle: CityGraphicBundle = {
      kind: "city",
      container,
      territory,
      aura,
      sprite,
    };
    this.staticGraphicCache.set(key, bundle);
    return bundle;
  }

  private prepareStaticLabels() {
    for (const label of this.staticLabelCache.values()) {
      this.tweens.killTweensOf(label);
      label.setVisible(false);
      label.setActive(false);
    }
  }

  private getOrCreateStaticLabel(
    key: string,
    x: number,
    y: number,
    value: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    originX: number,
    originY: number,
  ) {
    let label = this.staticLabelCache.get(key);
    if (!label) {
      label = this.add.text(x, y, value, style).setOrigin(originX, originY);
      this.uiLayer?.add(label);
      this.staticLabelCache.set(key, label);
    } else {
      label.setText(value);
      label.setStyle(style);
      label.setPosition(x, y);
      label.setOrigin(originX, originY);
    }

    label.setVisible(true);
    label.setActive(true);
    label.setAlpha(1);
    return label;
  }

  private getObjectLayerSignature() {
    const alliedOwnerSignature = Array.from(this.alliedOwnerNames).sort().join("|");
    const citySignature = this.cities
      .map((city) =>
        [
          city.cityId,
          city.x,
          city.y,
          city.cityName,
          city.ownerName,
          city.fogState,
          city.isCurrentPlayer ? 1 : 0,
        ].join(":"),
      )
      .join("|");
    const poiSignature = this.pois
      .map((poi) =>
        [poi.id, poi.x, poi.y, poi.kind, poi.state, poi.level, poi.resourceType ?? "", poi.remainingAmount ?? ""].join(":"),
      )
      .join("|");
    const reportSignature = this.showReports
      ? this.reportMarkers.map((report) => [report.id, report.kind, report.label, report.x, report.y, report.resultTone].join(":")).join("|")
      : "";
    const markerSignature = this.allianceMarkers
      .map((marker) => [marker.id, marker.label, marker.x, marker.y, marker.expiresAt ?? ""].join(":"))
      .join("|");

    return [
      this.worldSize,
      this.currentDetailLevel,
      this.filter,
      this.showReports ? "reports-on" : "reports-off",
      this.allianceTag ?? "",
      alliedOwnerSignature,
      citySignature,
      poiSignature,
      reportSignature,
      markerSignature,
    ].join(";");
  }

  private syncSelectionDetails() {
    const signature = [
      this.currentDetailLevel,
      this.selectedCityId ?? "",
      this.selectedPoiId ?? "",
      this.cities
        .filter((city) => city.cityId === this.selectedCityId)
        .map((city) => [city.cityId, city.stagedMarchCount, city.projectedOutcome ?? ""].join(":"))
        .join("|"),
      this.pois
        .filter((poi) => poi.id === this.selectedPoiId)
        .map((poi) => [poi.id, poi.kind, poi.level, poi.resourceType ?? "", poi.remainingAmount ?? ""].join(":"))
        .join("|"),
    ].join(";");

    if (signature === this.lastSelectionDetailSignature) {
      return;
    }

    this.lastSelectionDetailSignature = signature;
    for (const object of this.selectionDetailObjects) {
      object.destroy();
    }
    this.selectionDetailObjects = [];

    if (!this.uiLayer || this.currentDetailLevel !== "near") {
      return;
    }

    if (this.selectedCityId) {
      const selectedCity = this.cities.find((city) => city.cityId === this.selectedCityId);
      const point = this.cityLookup.get(this.selectedCityId);
      if (selectedCity && point) {
        if (selectedCity.stagedMarchCount > 0) {
          const staging = this.add
            .text(point.worldX, point.worldY + 26, `${selectedCity.stagedMarchCount} staged`, {
              color: "#f4d79c",
              fontFamily: "'Inter', sans-serif",
              fontSize: "11px",
              backgroundColor: "rgba(39, 19, 12, 0.65)",
              padding: { x: 5, y: 3 },
            })
            .setOrigin(0.5, 0);
          this.uiLayer.add(staging);
          this.selectionDetailObjects.push(staging);
        }

        if (selectedCity.projectedOutcome) {
          const outcome = this.add
            .text(point.worldX, point.worldY + 48, selectedCity.projectedOutcome === "ATTACKER_WIN" ? "Projected win" : "Projected hold", {
              color: selectedCity.projectedOutcome === "ATTACKER_WIN" ? "#85d0a1" : "#f0b19a",
              fontFamily: "'Inter', sans-serif",
              fontSize: "11px",
              backgroundColor: "rgba(24, 12, 9, 0.7)",
              padding: { x: 5, y: 3 },
            })
            .setOrigin(0.5, 0);
          this.uiLayer.add(outcome);
          this.selectionDetailObjects.push(outcome);
        }
      }
      return;
    }

    if (!this.selectedPoiId) {
      return;
    }

    const selectedPoi = this.pois.find((poi) => poi.id === this.selectedPoiId);
    const point = this.poiLookup.get(this.selectedPoiId);
    if (!selectedPoi || !point || selectedPoi.kind !== "RESOURCE_NODE") {
      return;
    }

    const reserveLabel = selectedPoi.remainingAmount != null
      ? `${poiResourceLabels[selectedPoi.resourceType ?? "WOOD"]} reserve ${selectedPoi.remainingAmount}`
      : `${poiResourceLabels[selectedPoi.resourceType ?? "WOOD"]} node L${selectedPoi.level}`;
    const detail = this.add
      .text(point.worldX, point.worldY + 48, reserveLabel, {
        color: "#dcefd0",
        fontFamily: "'Inter', sans-serif",
        fontSize: "11px",
        backgroundColor: "rgba(18, 29, 16, 0.68)",
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5, 0);
    this.uiLayer.add(detail);
    this.selectionDetailObjects.push(detail);
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
      const troopLead = this.add
        .image(-9, 2, "march-soldier")
        .setOrigin(0.5, 0.5)
        .setScale(0.95);
      const troopSupport = this.add
        .image(7, 4, "march-soldier")
        .setOrigin(0.5, 0.5)
        .setScale(0.78)
        .setAlpha(0.92);
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
      this.spawnFocusBeacon(origin.x, origin.y, color, 18);
      if (this.currentDetailLevel !== "far") {
        this.spawnSparkBurst(origin.x, origin.y, color, 4, 20, 360);
      }
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
      const body = this.add.image(0, 0, "scout-runner").setOrigin(0.5, 0.5);
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

      this.spawnFocusBeacon(from.x, from.y, MAP_COLOR_SCOUT, 16);
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

  private spawnFocusBeacon(x: number, y: number, color: number, radius: number) {
    if (!this.fxLayer) {
      return;
    }

    const container = this.add.container(x, y);
    const halo = this.add.circle(0, 0, radius + 12, color, 0.08);
    const outer = this.add.circle(0, 0, radius, 0x000000, 0);
    outer.setStrokeStyle(3, color, 0.82);
    const sweep = this.add.arc(0, 0, radius + 7, 285, 350, false, color, 0);
    sweep.setStrokeStyle(4, color, 0.9);
    const core = this.add.circle(0, 0, Math.max(3, radius * 0.24), color, 0.28);
    const fragments: Phaser.GameObjects.Rectangle[] = [];

    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6 + Math.PI / 6;
      const fragment = this.add.rectangle(
        Math.cos(angle) * radius * 0.62,
        Math.sin(angle) * radius * 0.62,
        4,
        4,
        color,
        0.86,
      );
      fragment.setRotation(Math.PI / 4 + angle * 0.18);
      fragments.push(fragment);
    }

    container.add([halo, outer, sweep, core, ...fragments]);
    this.fxLayer.add(container);

    if (this.reducedMotion) {
      container.setAlpha(0.42);
      this.time.delayedCall(180, () => container.destroy(true));
      return;
    }

    this.tweens.add({
      targets: halo,
      scale: 2.05,
      alpha: 0,
      duration: 620,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: outer,
      scale: 1.32,
      alpha: 0,
      duration: 560,
      ease: "Cubic.easeOut",
    });
    this.tweens.add({
      targets: sweep,
      rotation: Math.PI * 2,
      alpha: 0,
      duration: 760,
      ease: "Cubic.easeOut",
    });
    this.tweens.add({
      targets: core,
      scale: 1.8,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut",
    });
    for (let index = 0; index < fragments.length; index += 1) {
      const fragment = fragments[index];
      const angle = (Math.PI * 2 * index) / fragments.length + Math.PI / 6;
      this.tweens.add({
        targets: fragment,
        x: Math.cos(angle) * (radius + 18),
        y: Math.sin(angle) * (radius + 18),
        rotation: fragment.rotation + Math.PI * 0.9,
        scale: 0.34,
        alpha: 0,
        duration: 460 + index * 32,
        ease: "Cubic.easeOut",
      });
    }
    this.time.delayedCall(780, () => container.destroy(true));
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
    target: Phaser.GameObjects.Shape | Phaser.GameObjects.Image,
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
      this.spawnFocusBeacon(report.worldX, report.worldY - 18, MAP_COLOR_REPORT, 12);
      this.onOpenReport(report.data.id);
      return;
    }
    const marchId = this.findNearestMarch(worldPoint.x, worldPoint.y);
    if (marchId) {
      const march = this.marchEntities.get(marchId);
      if (march) {
        this.spawnFocusBeacon(march.container.x, march.container.y, getMarchColor(march.objective), 14);
      }
      this.onSelectMarch(marchId);
      return;
    }

    const poi = this.findNearestPoi(worldPoint.x, worldPoint.y);
    if (poi) {
      this.spawnFocusBeacon(poi.worldX, poi.worldY, poi.data.kind === "BARBARIAN_CAMP" ? MAP_COLOR_HOSTILE : MAP_COLOR_GATHER, 14);
      this.onSelectPoi(poi.data.id);
      return;
    }

    const city = this.findNearestCity(worldPoint.x, worldPoint.y);
    if (city) {
      this.spawnFocusBeacon(city.worldX, city.worldY, city.data.isCurrentPlayer ? MAP_COLOR_HOME : MAP_COLOR_NEUTRAL, 16);
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
      this.spawnFocusBeacon(poi.worldX, poi.worldY, MAP_COLOR_ALLIED, 14);
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
      this.spawnFocusBeacon(city.worldX, city.worldY, city.data.isCurrentPlayer ? MAP_COLOR_ALLIED : MAP_COLOR_NEUTRAL, 14);
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
    this.spawnFocusBeacon(point.x, point.y, MAP_COLOR_NEUTRAL, 12);
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
  playerCityBuildings,
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
      playerCityBuildings: playerCityBuildings ?? [],
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
    playerCityBuildings,
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
      projectTileToViewport: (x: number, y: number) => sceneRef.current?.projectTileToViewport(x, y) ?? null,
    };

    return () => {
      commandHandleRef.current = null;
    };
  }, [commandHandleRef]);

  return <div ref={containerRef} className={styles.mapCanvas} data-map-canvas="true" />;
}
