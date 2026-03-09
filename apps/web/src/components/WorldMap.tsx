import type { FogTileView, MapCity, MarchView } from "@frontier/shared";
import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";

import styles from "./WorldMap.module.css";

interface WorldMapProps {
  size: number;
  center: {
    x: number;
    y: number;
  };
  radius: number;
  tiles: FogTileView[];
  cities: MapCity[];
  marches: MarchView[];
  selectedCityId: string | null;
  onSelect: (cityId: string) => void;
}

class FrontierMapScene extends Phaser.Scene {
  private drawLayer?: Phaser.GameObjects.Container;
  private tiles: FogTileView[] = [];
  private cities: MapCity[] = [];
  private marches: MarchView[] = [];
  private selectedCityId: string | null = null;
  private onSelect: (cityId: string) => void = () => undefined;

  constructor() {
    super("frontier-map");
  }

  create() {
    this.cameras.main.setBackgroundColor("#121814");
    this.redraw();
  }

  configure(
    tiles: FogTileView[],
    cities: MapCity[],
    marches: MarchView[],
    selectedCityId: string | null,
    onSelect: (cityId: string) => void,
  ) {
    this.tiles = tiles;
    this.cities = cities;
    this.marches = marches;
    this.selectedCityId = selectedCityId;
    this.onSelect = onSelect;
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
    background.fillStyle(0x1b251d, 1);
    background.fillRect(0, 0, width, height);
    this.drawLayer.add(background);

    for (const tile of this.tiles) {
      const localX = tile.x - minX;
      const localY = tile.y - minY;
      const pixelX = localX * tileWidth;
      const pixelY = localY * tileHeight;
      const fillColor =
        tile.state === "VISIBLE" ? 0x617d53 : tile.state === "DISCOVERED" ? 0x374637 : 0x111513;
      const alpha = tile.state === "VISIBLE" ? 0.95 : tile.state === "DISCOVERED" ? 0.82 : 1;
      const tileGraphic = this.add.graphics();
      tileGraphic.fillStyle(fillColor, alpha);
      tileGraphic.fillRect(pixelX, pixelY, tileWidth, tileHeight);
      tileGraphic.lineStyle(1, 0x4a5a48, tile.state === "HIDDEN" ? 0.18 : 0.35);
      tileGraphic.strokeRect(pixelX, pixelY, tileWidth, tileHeight);
      this.drawLayer.add(tileGraphic);
    }

    for (const march of this.marches) {
      const line = this.add.graphics();
      const originX = (march.origin.x - minX + 0.5) * tileWidth;
      const originY = (march.origin.y - minY + 0.5) * tileHeight;
      const targetX = (march.target.x - minX + 0.5) * tileWidth;
      const targetY = (march.target.y - minY + 0.5) * tileHeight;
      line.lineStyle(3, 0xf0d392, 0.8);
      line.lineBetween(originX, originY, targetX, targetY);
      line.fillStyle(0xf0d392, 1);
      line.fillCircle(targetX, targetY, Math.max(5, tileWidth * 0.14));
      this.drawLayer.add(line);
    }

    for (const city of this.cities) {
      const centerX = (city.x - minX + 0.5) * tileWidth;
      const centerY = (city.y - minY + 0.5) * tileHeight;
      const fillColor =
        city.isCurrentPlayer ? 0x4f8a89 : city.fogState === "DISCOVERED" ? 0x83745f : 0xc68a48;
      const borderColor = city.cityId === this.selectedCityId ? 0xf2d083 : 0xf2efe3;
      const marker = this.add.circle(centerX, centerY, Math.max(8, Math.min(tileWidth, tileHeight) * 0.24), fillColor, 1);

      marker.setStrokeStyle(city.cityId === this.selectedCityId ? 4 : 2, borderColor, 1);
      marker.setInteractive({ useHandCursor: true });
      marker.on("pointerdown", () => this.onSelect(city.cityId));

      const label = this.add
        .text(centerX, centerY - 12, city.isCurrentPlayer ? "You" : city.cityName, {
          color: "#f4efe5",
          fontFamily: "'Palatino Linotype', 'Book Antiqua', serif",
          fontSize: "12px",
          align: "center",
          backgroundColor: "rgba(16,20,18,0.45)",
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
  marches,
  selectedCityId,
  onSelect,
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
      backgroundColor: "#121814",
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
    scene.configure(tiles, cities, marches, selectedCityId, onSelect);
  }, [cities, dimension, marches, onSelect, selectedCityId, tiles]);

  return <div ref={containerRef} className={styles.mapCanvas} />;
}
