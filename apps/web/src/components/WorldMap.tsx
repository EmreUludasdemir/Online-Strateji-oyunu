import type { FogTileView, MapCity, MarchView, PoiResourceType, PoiView } from "@frontier/shared";
import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";

import styles from "./WorldMap.module.css";

const poiResourceLabels: Record<PoiResourceType, string> = {
  WOOD: "Wood",
  STONE: "Stone",
  FOOD: "Food",
  GOLD: "Gold",
};

interface WorldMapProps {
  size: number;
  center: {
    x: number;
    y: number;
  };
  radius: number;
  tiles: FogTileView[];
  cities: MapCity[];
  pois: PoiView[];
  marches: MarchView[];
  selectedCityId: string | null;
  selectedPoiId: string | null;
  onSelectCity: (cityId: string) => void;
  onSelectPoi: (poiId: string) => void;
}

class FrontierMapScene extends Phaser.Scene {
  private drawLayer?: Phaser.GameObjects.Container;
  private tiles: FogTileView[] = [];
  private cities: MapCity[] = [];
  private pois: PoiView[] = [];
  private marches: MarchView[] = [];
  private selectedCityId: string | null = null;
  private selectedPoiId: string | null = null;
  private onSelectCity: (cityId: string) => void = () => undefined;
  private onSelectPoi: (poiId: string) => void = () => undefined;

  constructor() {
    super("frontier-map");
  }

  create() {
    this.cameras.main.setBackgroundColor("#5c4730");
    this.redraw();
  }

  configure(
    tiles: FogTileView[],
    cities: MapCity[],
    pois: PoiView[],
    marches: MarchView[],
    selectedCityId: string | null,
    selectedPoiId: string | null,
    onSelectCity: (cityId: string) => void,
    onSelectPoi: (poiId: string) => void,
  ) {
    this.tiles = tiles;
    this.cities = cities;
    this.pois = pois;
    this.marches = marches;
    this.selectedCityId = selectedCityId;
    this.selectedPoiId = selectedPoiId;
    this.onSelectCity = onSelectCity;
    this.onSelectPoi = onSelectPoi;
    this.redraw();
  }

  redraw() {
    if (!this.sys.isActive()) {
      return;
    }

    this.drawLayer?.destroy(true);
    this.drawLayer = this.add.container(0, 0);

    const width = this.scale.width;
    const height = this.scale.height;
    const minX = Math.min(...this.tiles.map((tile) => tile.x));
    const maxX = Math.max(...this.tiles.map((tile) => tile.x));
    const minY = Math.min(...this.tiles.map((tile) => tile.y));
    const maxY = Math.max(...this.tiles.map((tile) => tile.y));
    const gridWidth = maxX - minX + 1;
    const gridHeight = maxY - minY + 1;
    const tileWidth = width / gridWidth;
    const tileHeight = height / gridHeight;

    const background = this.add.graphics();
    background.fillStyle(0x5f492f, 1);
    background.fillRect(0, 0, width, height);
    this.drawLayer.add(background);

    for (const tile of this.tiles) {
      const localX = tile.x - minX;
      const localY = tile.y - minY;
      const pixelX = localX * tileWidth;
      const pixelY = localY * tileHeight;
      const fillColor =
        tile.state === "VISIBLE" ? 0xb99968 : tile.state === "DISCOVERED" ? 0x6c5438 : 0x231810;
      const alpha = tile.state === "VISIBLE" ? 0.95 : tile.state === "DISCOVERED" ? 0.82 : 1;
      const tileGraphic = this.add.graphics();
      tileGraphic.fillStyle(fillColor, alpha);
      tileGraphic.fillRect(pixelX, pixelY, tileWidth, tileHeight);
      tileGraphic.lineStyle(1, 0x8d6b40, tile.state === "HIDDEN" ? 0.14 : 0.32);
      tileGraphic.strokeRect(pixelX, pixelY, tileWidth, tileHeight);
      this.drawLayer.add(tileGraphic);
    }

    for (const march of this.marches) {
      const line = this.add.graphics();
      const originX = (march.origin.x - minX + 0.5) * tileWidth;
      const originY = (march.origin.y - minY + 0.5) * tileHeight;
      const targetX = (march.target.x - minX + 0.5) * tileWidth;
      const targetY = (march.target.y - minY + 0.5) * tileHeight;
      const lineColor =
        march.objective === "RESOURCE_GATHER"
          ? 0x2f7d7f
          : march.objective === "BARBARIAN_ATTACK"
            ? 0xa95d2f
            : 0xe0be73;
      line.lineStyle(3, lineColor, 0.82);
      line.lineBetween(originX, originY, targetX, targetY);
      line.fillStyle(lineColor, 1);
      line.fillCircle(targetX, targetY, Math.max(5, tileWidth * 0.14));
      this.drawLayer.add(line);
    }

    for (const poi of this.pois) {
      const centerX = (poi.x - minX + 0.5) * tileWidth;
      const centerY = (poi.y - minY + 0.5) * tileHeight;
      const strokeColor = poi.id === this.selectedPoiId ? 0xf2d083 : 0xe7e0cf;
      const alpha = poi.state === "ACTIVE" ? 0.96 : 0.56;
      const size = Math.max(10, Math.min(tileWidth, tileHeight) * 0.2);
      const labelText =
        poi.kind === "BARBARIAN_CAMP"
          ? `Camp L${poi.level}`
          : `${poi.resourceType ? poiResourceLabels[poi.resourceType] : "Node"} L${poi.level}`;

      if (poi.kind === "BARBARIAN_CAMP") {
        const marker = this.add.rectangle(centerX, centerY, size * 1.45, size * 1.45, 0xa55e32, alpha).setAngle(45);
        marker.setStrokeStyle(poi.id === this.selectedPoiId ? 4 : 2, strokeColor, 1);
        marker.setInteractive({ useHandCursor: true });
        marker.on("pointerdown", () => this.onSelectPoi(poi.id));
        this.drawLayer.add(marker);
      } else {
        const fillColor =
          poi.resourceType === "WOOD"
            ? 0x7ca15f
            : poi.resourceType === "STONE"
              ? 0x9ea0a1
              : poi.resourceType === "FOOD"
                ? 0xb4a35a
                : 0xd3a74e;
        const marker = this.add.circle(centerX, centerY, size, fillColor, alpha);
        marker.setStrokeStyle(poi.id === this.selectedPoiId ? 4 : 2, strokeColor, 1);
        marker.setInteractive({ useHandCursor: true });
        marker.on("pointerdown", () => this.onSelectPoi(poi.id));
        this.drawLayer.add(marker);
      }

      const detailText =
        poi.kind === "RESOURCE_NODE" && poi.remainingAmount != null ? `${labelText} / ${poi.remainingAmount}` : labelText;
      const label = this.add
        .text(centerX, centerY + 14, detailText, {
          color: "#fff6e6",
          fontFamily: "'Baskerville Old Face', 'Palatino Linotype', serif",
          fontSize: "11px",
          align: "center",
          backgroundColor: "rgba(54,31,21,0.58)",
        })
        .setOrigin(0.5, 0);

      this.drawLayer.add(label);
    }

    for (const city of this.cities) {
      const centerX = (city.x - minX + 0.5) * tileWidth;
      const centerY = (city.y - minY + 0.5) * tileHeight;
      const fillColor =
        city.isCurrentPlayer ? 0x2f7175 : city.fogState === "DISCOVERED" ? 0x8a6e4d : 0xc37d44;
      const borderColor = city.cityId === this.selectedCityId ? 0xf2d083 : 0xf2efe3;
      const marker = this.add.circle(centerX, centerY, Math.max(8, Math.min(tileWidth, tileHeight) * 0.24), fillColor, 1);

      marker.setStrokeStyle(city.cityId === this.selectedCityId ? 4 : 2, borderColor, 1);
      marker.setInteractive({ useHandCursor: true });
      marker.on("pointerdown", () => this.onSelectCity(city.cityId));

      const label = this.add
        .text(centerX, centerY - 12, city.isCurrentPlayer ? "You" : city.cityName, {
          color: "#fff6e6",
          fontFamily: "'Baskerville Old Face', 'Palatino Linotype', serif",
          fontSize: "12px",
          align: "center",
          backgroundColor: "rgba(54,31,21,0.58)",
        })
        .setOrigin(0.5, 1);

      this.drawLayer.add(marker);
      this.drawLayer.add(label);
    }
  }
}

export default function WorldMap({
  tiles,
  cities,
  pois,
  marches,
  selectedCityId,
  selectedPoiId,
  onSelectCity,
  onSelectPoi,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<FrontierMapScene | null>(null);
  const [dimension, setDimension] = useState(560);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return undefined;
    }

    const scene = new FrontierMapScene();
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: dimension,
      height: dimension,
      parent: containerRef.current,
      scene: [scene],
      backgroundColor: "#5c4730",
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
  }, [dimension]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.max(320, Math.floor(entries[0].contentRect.width));
      setDimension(Math.min(nextWidth, 720));
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

    game.scale.resize(dimension, dimension);
    scene.configure(tiles, cities, pois, marches, selectedCityId, selectedPoiId, onSelectCity, onSelectPoi);
  }, [cities, dimension, marches, onSelectCity, onSelectPoi, pois, selectedCityId, selectedPoiId, tiles]);

  return <div ref={containerRef} className={styles.mapCanvas} />;
}
