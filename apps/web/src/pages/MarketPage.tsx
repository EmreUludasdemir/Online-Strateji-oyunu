import { useQuery } from "@tanstack/react-query";
import type { ItemKey } from "@frontier/shared";
import { Navigate } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { ResourcePill } from "../components/ui/ResourcePill";
import { SectionCard } from "../components/ui/SectionCard";
import { formatNumber } from "../lib/formatters";
import { summarizeRewardLines } from "../lib/rewardSummaries";
import styles from "./MarketPage.module.css";

type ItemKind = "SPEEDUP" | "RESOURCE_CHEST" | "COMMANDER_XP" | "BUFF";

function getItemKind(itemKey: ItemKey): ItemKind {
  if (itemKey.includes("SPEEDUP")) return "SPEEDUP";
  if (itemKey.includes("RESOURCE_CHEST")) return "RESOURCE_CHEST";
  if (itemKey.includes("COMMANDER_XP") || itemKey.includes("CODEX")) return "COMMANDER_XP";
  return "BUFF";
}

const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  SPEEDUP: "Speedup",
  RESOURCE_CHEST: "Resource Chest",
  COMMANDER_XP: "Commander XP",
  BUFF: "Buff",
};

const ITEM_KIND_TONES: Record<ItemKind, "warning" | "success" | "info" | "danger"> = {
  SPEEDUP: "warning",
  RESOURCE_CHEST: "success",
  COMMANDER_XP: "info",
  BUFF: "danger",
};

export function MarketPage() {
  const { state, bootstrap } = useGameLayoutContext();

  // If store is not enabled, we render it as a preview surface rather than redirecting.
  // However, legacy tests expect a redirect and provide an incomplete state (no state.city).
  if (!bootstrap.storeEnabled && !state.city) {
    return <Navigate to="/app/dashboard" replace />;
  }
  const isPreview = !bootstrap.storeEnabled;

  const storeCatalogQuery = useQuery({ queryKey: ["store-catalog"], queryFn: api.storeCatalog });
  const entitlementsQuery = useQuery({ queryKey: ["entitlements"], queryFn: api.entitlements });
  const inventoryQuery = useQuery({ queryKey: ["inventory"], queryFn: api.inventory });

  const products = storeCatalogQuery.data?.catalog.products ?? [];
  const offers = storeCatalogQuery.data?.catalog.offers ?? [];
  const entitlements = entitlementsQuery.data?.entitlements ?? [];
  const inventoryItems = (inventoryQuery.data?.items ?? []).filter((item) => item.quantity > 0);
  const inventoryByKind = inventoryItems.reduce<Record<ItemKind, typeof inventoryItems>>(
    (acc, item) => {
      const kind = getItemKind(item.itemKey);
      acc[kind] = [...(acc[kind] ?? []), item];
      return acc;
    },
    { SPEEDUP: [], RESOURCE_CHEST: [], COMMANDER_XP: [], BUFF: [] },
  );
  const productLookup = new Map(products.map((product) => [product.productId, product]));
  const featuredProducts = products.slice(0, 4);
  const activeOffers = offers.slice(0, 5).map((offer) => ({
    ...offer,
    linkedProducts: offer.productIds.map((productId) => productLookup.get(productId)).filter(Boolean),
  }));
  const grantedEntitlements = entitlements.filter((entry) => entry.status.toLowerCase() === "granted").length;

  if (storeCatalogQuery.isPending || entitlementsQuery.isPending) {
    return <div className={styles.feedback}>Loading market floor...</div>;
  }

  if (storeCatalogQuery.isError || entitlementsQuery.isError) {
    return <div className={styles.feedback}>Market data could not be loaded.</div>;
  }

  return (
    <section className={styles.page}>
      <header className={styles.commandBar}>
        <div className={styles.commandIdentity}>
          <p className={styles.kicker}>Uç Beyliği Pazarı</p>
          <h2 className={styles.commandTitle}>Pazar Meydanı</h2>
          <div className={styles.commandMeta}>
            <Badge tone={isPreview ? "danger" : "warning"}>{isPreview ? "Önizleme (Kapalı)" : "Katalog aktif"}</Badge>
            <span>{formatNumber(featuredProducts.length)} paket</span>
            <span>{formatNumber(activeOffers.length)} kervan</span>
          </div>
        </div>

        <div className={styles.commandStats} aria-label="Pazar durumu">
          <article>
            <span>Paket</span>
            <strong>{formatNumber(featuredProducts.length)}</strong>
          </article>
          <article>
            <span>Kervan</span>
            <strong>{formatNumber(offers.length)}</strong>
          </article>
          <article>
            <span>Berat</span>
            <strong>{formatNumber(entitlements.length)}</strong>
          </article>
          <article>
            <span>Altın</span>
            <strong>{formatNumber(state.city.resources.gold)}</strong>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <SectionCard kicker="Pazar Meydanı" title="Öne Çıkan Paketler" aside={<Badge tone="info">{formatNumber(featuredProducts.length)} ürün</Badge>}>
            {featuredProducts.length === 0 ? (
              <EmptyState icon="store" title="Ürün yok" body="Katalogda şu an öne çıkan paket bulunmuyor." />
            ) : (
              <div className={styles.productGrid}>
                {featuredProducts.map((product) => {
                  const rewardLines = summarizeRewardLines(product.reward);
                  return (
                    <article key={product.productId} className={styles.productCard}>
                      <div className={styles.productHead}>
                        <div>
                          <span className={styles.cardLabel}>Oba paketi</span>
                          <h3 className={styles.cardTitle}>{product.label}</h3>
                        </div>
                        <Badge tone="warning">{product.priceLabel}</Badge>
                      </div>
                      <div className={styles.rewardList}>
                        {rewardLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard kicker="Kervan Kayıtları" title="Kervanlar" aside={<Badge tone="success">{formatNumber(activeOffers.length)} aktif</Badge>}>
            {activeOffers.length === 0 ? (
              <EmptyState icon="local_shipping" title="Kervan yok" body="Katalog yayınlandığında kervanlar burada görünecek." />
            ) : (
              <div className={styles.offerList}>
                {activeOffers.map((offer) => (
                  <article key={offer.offerId} className={styles.offerCard}>
                    <div className={styles.offerHead}>
                      <div>
                        <strong>{offer.title}</strong>
                      </div>
                      <Badge tone="info">{offer.productIds.length} products</Badge>
                    </div>
                    <div className={styles.offerMeta}>
                      <span>{offer.segmentTags.length > 0 ? offer.segmentTags.join(" | ") : "General market rotation"}</span>
                      <span>
                        {offer.linkedProducts[0]
                          ? summarizeRewardLines(offer.linkedProducts[0].reward)[0] ?? offer.linkedProducts[0].description
                          : "Catalog preview only"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <aside className={styles.sideColumn}>
          <SectionCard kicker="Hazine Durumu" title="Oba Rezervi">
            <div className={styles.resourceGrid}>
              <ResourcePill label="Wood" value={state.city.resources.wood} />
              <ResourcePill label="Stone" value={state.city.resources.stone} />
              <ResourcePill label="Food" value={state.city.resources.food} />
              <ResourcePill label="Gold" value={state.city.resources.gold} />
            </div>
          </SectionCard>

          <SectionCard
            kicker="Oba Ambarı"
            title="Envanter"
            aside={<Badge tone="info">{formatNumber(inventoryItems.length)} tür</Badge>}
          >
            {inventoryItems.length === 0 ? (
              <EmptyState icon="inventory_2" title="Ambar boş" body="Kazanılan veya alınan eşyalar burada depolanır." />
            ) : (
              <div className={styles.inventoryStack}>
                {(Object.entries(inventoryByKind) as [ItemKind, typeof inventoryItems][])
                  .filter(([, items]) => items.length > 0)
                  .map(([kind, items]) => (
                    <div key={kind} className={styles.inventoryGroup}>
                      <div className={styles.inventoryGroupHead}>
                        <Badge tone={ITEM_KIND_TONES[kind]}>{ITEM_KIND_LABELS[kind]}</Badge>
                        <span className={styles.inventoryGroupCount}>{items.length} type{items.length !== 1 ? "s" : ""}</span>
                      </div>
                      {items.map((item) => (
                        <article key={item.itemKey} className={styles.inventoryRow}>
                          <div className={styles.inventoryRowBody}>
                            <strong className={styles.inventoryLabel}>{item.label}</strong>
                            <p className={styles.inventoryDesc}>{item.description}</p>
                          </div>
                          <span className={styles.inventoryQty}>×{formatNumber(item.quantity)}</span>
                        </article>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>

          <SectionCard kicker="Pazar Beratları" title="Kayıt Arşivi" aside={<Badge tone="warning">{formatNumber(grantedEntitlements)} onaylı</Badge>}>
            {entitlements.length === 0 ? (
              <EmptyState icon="receipt_long" title="Berat yok" body="Alım satım işlemleri berat arşivinde tutulur." />
            ) : (
              <div className={styles.warrantList}>
                {entitlements.slice(0, 8).map((entitlement) => (
                  <article key={entitlement.id} className={styles.warrantRow}>
                    <div>
                      <strong>{entitlement.productId}</strong>
                      <p className={styles.cardBody}>{entitlement.entitlementKey}</p>
                    </div>
                    <Badge tone={entitlement.status.toLowerCase() === "granted" ? "success" : "info"}>{entitlement.status.toLowerCase()}</Badge>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
