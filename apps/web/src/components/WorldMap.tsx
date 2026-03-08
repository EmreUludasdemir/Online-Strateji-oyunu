import type { MapCity } from "@frontier/shared";
import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";

import styles from "./WorldMap.module.css";

interface WorldMapProps {
  size: number;
  cities: MapCity[];
  selectedCityId: string | null;
  onSelect: (cityId: string) => void;
}

class FrontierMapScene extends Phaser.Scene {
  private drawLayer?: Phaser.GameObjects.Container;
  private size = 20;
  private cities: MapCity[] = [];
  private selectedCityId: string | null = null;
  private onSelect: (cityId: string) => void = () => undefined;

  constructor() {
    super("frontier-map");
  }

  create() {
    this.cameras.main.setBackgroundColor("#09131b");
    this.redraw();
  }

  configure(size: number, cities: MapCity[], selectedCityId: string | null, onSelect: (cityId: string) => void) {
    this.size = size;
    this.cities = cities;
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
    const tileWidth = width / this.size;
    const tileHeight = height / this.size;

    const grid = this.add.graphics();
    grid.fillStyle(0x0d1923, 1);
    grid.fillRect(0, 0, width, height);
    grid.lineStyle(1, 0x193041, 1);

    for (let index = 0; index <= this.size; index += 1) {
      grid.lineBetween(index * tileWidth, 0, index * tileWidth, height);
      grid.lineBetween(0, index * tileHeight, width, index * tileHeight);
    }

    this.drawLayer.add(grid);

    for (const city of this.cities) {
      const centerX = city.x * tileWidth + tileWidth / 2;
      const centerY = city.y * tileHeight + tileHeight / 2;
      const fillColor = city.isCurrentPlayer ? 0x2e8bbf : city.canAttack ? 0xcf8a3a : 0x72808f;
      const borderColor = city.cityId === this.selectedCityId ? 0xf7d36b : 0xe7eef4;
      const radius = Math.max(8, Math.min(tileWidth, tileHeight) * 0.22);
      const marker = this.add.circle(centerX, centerY, radius, fillColor, 1);

      marker.setStrokeStyle(city.cityId === this.selectedCityId ? 4 : 2, borderColor, 1);
      marker.setInteractive({ useHandCursor: true });
      marker.on("pointerdown", () => this.onSelect(city.cityId));

      const label = this.add
        .text(centerX, centerY - radius - 6, city.isCurrentPlayer ? "You" : city.ownerName, {
          color: "#f4efe5",
          fontFamily: "'Trebuchet MS', 'Lucida Sans Unicode', sans-serif",
          fontSize: "12px",
          align: "center",
        })
        .setOrigin(0.5, 1);

      this.drawLayer.add(marker);
      this.drawLayer.add(label);
    }
  }
}

export default function WorldMap({ size, cities, selectedCityId, onSelect }: WorldMapProps) {
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
      backgroundColor: "#09131b",
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
    scene.configure(size, cities, selectedCityId, onSelect);
  }, [cities, dimension, onSelect, selectedCityId, size]);

  return <div ref={containerRef} className={styles.mapCanvas} />;
}
