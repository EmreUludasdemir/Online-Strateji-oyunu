import type { CommanderProgressView, CommanderSkillNodeView } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "../ui/Badge";
import styles from "./CommanderSkillTree.module.css";

const ICONS: Record<string, string> = {
  sword: "ATK",
  drum: "CMD",
  banner: "RLY",
  shield: "DEF",
  gate: "GRD",
  crown: "LDR",
  watch: "SCT",
  hoof: "SPD",
  tower: "HLD",
  ring: "AUR",
  flame: "DMG",
  ledger: "LOG",
  gem: "ELT",
  veil: "FOG",
  grain: "GTH",
  coin: "ECO",
};

function getNodeTone(node: CommanderSkillNodeView) {
  if (node.active) {
    return "active";
  }
  if (node.unlocked) {
    return "unlocked";
  }
  return "locked";
}

export function CommanderSkillTree({ commander }: { commander: CommanderProgressView }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(commander.skillTree.nodes.find((node) => node.active)?.id ?? null);

  useEffect(() => {
    setSelectedNodeId(commander.skillTree.nodes.find((node) => node.active)?.id ?? commander.skillTree.nodes[0]?.id ?? null);
  }, [commander]);

  const selectedNode = useMemo(
    () => commander.skillTree.nodes.find((node) => node.id === selectedNodeId) ?? commander.skillTree.nodes[0],
    [commander.skillTree.nodes, selectedNodeId],
  );

  const nodePositions = useMemo(
    () =>
      new Map(
        commander.skillTree.nodes.map((node) => [
          node.id,
          {
            x: node.lane === 0 ? 70 : 230,
            y: 68 + (node.tier - 1) * 114,
          },
        ]),
      ),
    [commander.skillTree.nodes],
  );

  return (
    <section className={styles.treeCard}>
      <header className={styles.treeHeader}>
        <div>
          <p className={styles.kicker}>Talent Tree</p>
          <h3 className={styles.title}>{commander.skillTree.trackLabel}</h3>
        </div>
        <Badge tone="info">{commander.talentPointsAvailable} points ready</Badge>
      </header>

      <div className={styles.treeBody}>
        <div className={styles.canvasWrap}>
          <svg className={styles.links} viewBox="0 0 300 420" aria-hidden="true">
            {commander.skillTree.links.map((link) => {
              const from = nodePositions.get(link.from);
              const to = nodePositions.get(link.to);
              if (!from || !to) {
                return null;
              }

              return (
                <path
                  key={`${link.from}-${link.to}`}
                  d={`M ${from.x} ${from.y} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y}`}
                  className={styles.link}
                />
              );
            })}
          </svg>

          {commander.skillTree.nodes.map((node) => {
            const tone = getNodeTone(node);
            const position = nodePositions.get(node.id)!;
            const icon = ICONS[node.icon] ?? "SYS";

            return (
              <button
                key={node.id}
                type="button"
                className={[styles.node, styles[`node${tone[0].toUpperCase()}${tone.slice(1)}`], selectedNode?.id === node.id ? styles.nodeSelected : ""]
                  .filter(Boolean)
                  .join(" ")}
                style={{ left: position.x, top: position.y }}
                onClick={() => setSelectedNodeId(node.id)}
                aria-pressed={selectedNode?.id === node.id}
              >
                <span className={styles.nodeIcon}>{icon}</span>
                <span className={styles.nodeLabel}>{node.label}</span>
                <small className={styles.nodeTier}>Tier {node.tier}</small>
              </button>
            );
          })}
        </div>

        <aside className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div>
              <p className={styles.kicker}>Selected Doctrine</p>
              <h4 className={styles.detailTitle}>{selectedNode.label}</h4>
            </div>
            <Badge tone={selectedNode.active ? "success" : selectedNode.unlocked ? "info" : "warning"}>
              {selectedNode.active ? "Active" : selectedNode.unlocked ? "Unlocked" : `Requires ${selectedNode.requiredPoints}`}
            </Badge>
          </div>
          <p className={styles.detailBody}>{selectedNode.description}</p>
          <dl className={styles.metaGrid}>
            <div>
              <dt>Bonus</dt>
              <dd>{selectedNode.bonusLabel}</dd>
            </div>
            <div>
              <dt>Tier</dt>
              <dd>{selectedNode.tier}</dd>
            </div>
            <div>
              <dt>Lane</dt>
              <dd>{selectedNode.lane + 1}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selectedNode.active ? "Selected" : selectedNode.unlocked ? "Ready" : "Locked"}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
