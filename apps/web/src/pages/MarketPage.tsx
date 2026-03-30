import { useQuery } from "@tanstack/react-query";
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

export function MarketPage() {
  const { state, bootstrap } = useGameLayoutContext();

  if (!bootstrap.storeEnabled) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const storeCatalogQuery = useQuery({ queryKey: ["store-catalog"], queryFn: api.storeCatalog });
  const entitlementsQuery = useQuery({ queryKey: ["entitlements"], queryFn: api.entitlements });

  const products = storeCatalogQuery.data?.catalog.products ?? [];
  const offers = storeCatalogQuery.data?.catalog.offers ?? [];
  const entitlements = entitlementsQuery.data?.entitlements ?? [];
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
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>Imperial Market</p>
            <h2 className={styles.heroTitle}>Exchange floor and warrant ledger</h2>
            <p className={styles.heroLead}>
              Commerce now sits on a dedicated surface with featured bundles, live caravan rotations, and entitlement history.
            </p>
          </div>
          <Badge tone="warning">Catalog preview</Badge>
        </div>

        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Featured bundles</span>
            <strong className={styles.summaryValue}>{formatNumber(featuredProducts.length)}</strong>
            <span className={styles.summaryMeta}>Highlighted market entries on the floor.</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Trade caravans</span>
            <strong className={styles.summaryValue}>{formatNumber(offers.length)}</strong>
            <span className={styles.summaryMeta}>Rotating offers and product clusters.</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Issued warrants</span>
            <strong className={styles.summaryValue}>{formatNumber(entitlements.length)}</strong>
            <span className={styles.summaryMeta}>Commerce records already attached to this ruler.</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Treasury gold</span>
            <strong className={styles.summaryValue}>{formatNumber(state.city.resources.gold)}</strong>
            <span className={styles.summaryMeta}>Current city reserve exposed to commerce view.</span>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <SectionCard kicker="Exchange floor" title="Featured bundles" aside={<Badge tone="info">{formatNumber(featuredProducts.length)} listings</Badge>}>
            {featuredProducts.length === 0 ? (
              <EmptyState title="No market bundles" body="The current catalog does not expose featured products yet." />
            ) : (
              <div className={styles.productGrid}>
                {featuredProducts.map((product) => {
                  const rewardLines = summarizeRewardLines(product.reward);
                  return (
                    <article key={product.productId} className={styles.productCard}>
                      <div className={styles.productHead}>
                        <div>
                          <span className={styles.cardLabel}>Imperial bundle</span>
                          <h3 className={styles.cardTitle}>{product.label}</h3>
                        </div>
                        <Badge tone="warning">{product.priceLabel}</Badge>
                      </div>
                      <p className={styles.cardBody}>{product.description}</p>
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

          <SectionCard kicker="Caravan ledger" title="Offer rotations" aside={<Badge tone="success">{formatNumber(activeOffers.length)} live</Badge>}>
            {activeOffers.length === 0 ? (
              <EmptyState title="No caravans posted" body="Offer rotations will appear here when the catalog exposes them." />
            ) : (
              <div className={styles.offerList}>
                {activeOffers.map((offer) => (
                  <article key={offer.offerId} className={styles.offerCard}>
                    <div className={styles.offerHead}>
                      <div>
                        <strong>{offer.title}</strong>
                        <p className={styles.cardBody}>{offer.description}</p>
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
          <SectionCard kicker="Treasury position" title="City liquidity">
            <div className={styles.resourceGrid}>
              <ResourcePill label="Wood" value={state.city.resources.wood} />
              <ResourcePill label="Stone" value={state.city.resources.stone} />
              <ResourcePill label="Food" value={state.city.resources.food} />
              <ResourcePill label="Gold" value={state.city.resources.gold} />
            </div>
          </SectionCard>

          <SectionCard kicker="Imperial warrants" title="Entitlement archive" aside={<Badge tone="warning">{formatNumber(grantedEntitlements)} granted</Badge>}>
            {entitlements.length === 0 ? (
              <EmptyState title="No warrants issued" body="Purchase verification and rewards will populate the archive once entitlements are granted." />
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
