import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AllianceRole, ResourceKey } from "@frontier/shared";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

import { api } from "../api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SectionCard } from "../components/ui/SectionCard";
import { useGameLayoutContext } from "../components/GameLayout";
import { formatDateTime, formatNumber } from "../lib/formatters";
import styles from "./AllianceRolesPage.module.css";

const ROLE_OPTIONS: AllianceRole[] = ["LEADER", "OFFICER", "MEMBER", "RECRUIT"];
const RESOURCE_OPTIONS: ResourceKey[] = ["wood", "stone", "food", "gold"];

function getRoleTone(role: AllianceRole): "success" | "info" | "warning" {
  if (role === "LEADER") {
    return "success";
  }
  if (role === "OFFICER") {
    return "info";
  }
  return "warning";
}

function formatResourceLabel(resource: ResourceKey) {
  return resource.slice(0, 1).toUpperCase() + resource.slice(1);
}

export function AllianceRolesPage() {
  const { state } = useGameLayoutContext();
  const queryClient = useQueryClient();
  const [donationResource, setDonationResource] = useState<ResourceKey>("wood");
  const [donationAmount, setDonationAmount] = useState(240);

  const allianceQuery = useQuery({
    queryKey: ["alliance-state"],
    queryFn: api.allianceState,
  });

  const invalidateAlliance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["alliance-state"] }),
      queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      queryClient.invalidateQueries({ queryKey: ["leaderboard", "alliance_contribution"] }),
    ]);
  };

  const donateMutation = useMutation({
    mutationFn: () =>
      api.donateAllianceResources({
        wood: donationResource === "wood" ? donationAmount : 0,
        stone: donationResource === "stone" ? donationAmount : 0,
        food: donationResource === "food" ? donationAmount : 0,
        gold: donationResource === "gold" ? donationAmount : 0,
      }),
    onSuccess: invalidateAlliance,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AllianceRole }) => api.updateAllianceRole(userId, role),
    onSuccess: invalidateAlliance,
  });

  const alliance = allianceQuery.data?.alliance ?? null;

  const donationStats = useMemo(() => {
    if (!alliance) {
      return { totalValue: 0, donationCount: 0 };
    }

    return alliance.donations.reduce(
      (accumulator, donation) => ({
        totalValue: accumulator.totalValue + donation.totalValue,
        donationCount: accumulator.donationCount + 1,
      }),
      { totalValue: 0, donationCount: 0 },
    );
  }, [alliance]);

  if (allianceQuery.isPending) {
    return <div className={styles.feedback}>Loading role management...</div>;
  }

  if (allianceQuery.isError) {
    return <div className={styles.feedback}>Alliance role management could not be loaded.</div>;
  }

  if (!alliance) {
    return (
      <section className={styles.page}>
        <SectionCard kicker="Alliance Roles" title="Join a banner first">
          <EmptyState
            title="No alliance membership"
            body="Role controls, contribution tracking, and treasury donations unlock after joining an alliance."
          />
          <div className={styles.actions}>
            <Link className={styles.inlineLink} to="/app/alliance">
              Open Alliance Chamber
            </Link>
          </div>
        </SectionCard>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>Alliance Roles</p>
            <h2 className={styles.heroTitle}>
              {alliance.name} [{alliance.tag}]
            </h2>
            <p className={styles.heroLead}>
              Manage role ladders, track donation history, and keep contribution pressure visible for the whole banner.
            </p>
          </div>
          <Badge tone={getRoleTone(alliance.role)}>{alliance.role}</Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Members</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance.memberCount)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Total Donations</span>
            <strong className={styles.summaryValue}>{formatNumber(donationStats.totalValue)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Treasury</span>
            <strong className={styles.summaryValue}>
              {formatNumber(Object.values(alliance.treasury).reduce((sum, value) => sum + value, 0))}
            </strong>
          </article>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <SectionCard kicker="Role Ladder" title="Member assignments">
            <div className={styles.memberList}>
              {alliance.members.map((member) => (
                <article key={member.userId} className={styles.memberCard}>
                  <div className={styles.memberHeader}>
                    <div>
                      <strong>{member.username}</strong>
                      <p className={styles.meta}>
                        {member.cityName} · Joined {formatDateTime(member.joinedAt)}
                      </p>
                    </div>
                    <Badge tone={getRoleTone(member.role)}>{member.role}</Badge>
                  </div>
                  <div className={styles.roleButtons}>
                    {ROLE_OPTIONS.map((role) => (
                      <Button
                        key={role}
                        type="button"
                        size="small"
                        variant={member.role === role ? "primary" : "secondary"}
                        disabled={
                          roleMutation.isPending ||
                          member.userId === state.player.id ||
                          (alliance.role !== "LEADER" && alliance.role !== "OFFICER") ||
                          member.role === role
                        }
                        onClick={() => roleMutation.mutate({ userId: member.userId, role })}
                      >
                        {role}
                      </Button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard kicker="Contribution Ledger" title="Donation history">
            <div className={styles.donationHistory}>
              {alliance.donations.length === 0 ? (
                <EmptyState title="No donations yet" body="The first treasury transfer will appear here." />
              ) : (
                alliance.donations.map((donation) => (
                  <article key={donation.id} className={styles.donationRow}>
                    <div>
                      <strong>{donation.username}</strong>
                      <p className={styles.meta}>{formatDateTime(donation.createdAt)}</p>
                    </div>
                    <div className={styles.donationBreakdown}>
                      {Object.entries(donation.resources)
                        .filter(([, value]) => value > 0)
                        .map(([resource, value]) => (
                          <span key={resource}>
                            {resource}: {formatNumber(value)}
                          </span>
                        ))}
                    </div>
                    <Badge tone="info">{formatNumber(donation.totalValue)} total</Badge>
                  </article>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        <aside className={styles.sideColumn}>
          <SectionCard kicker="Treasury Transfer" title="Make a donation">
            <div className={styles.donationForm}>
              <select value={donationResource} onChange={(event) => setDonationResource(event.target.value as ResourceKey)}>
                {RESOURCE_OPTIONS.map((resource) => (
                  <option key={resource} value={resource}>
                    {formatResourceLabel(resource)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={10}
                max={9999}
                value={donationAmount}
                onChange={(event) => setDonationAmount(Number(event.target.value))}
              />
              <p className={styles.meta}>
                Available city stock: {formatNumber(state.city.resources[donationResource])} {donationResource}
              </p>
              <Button
                type="button"
                disabled={
                  donateMutation.isPending ||
                  donationAmount < 1 ||
                  donationAmount > state.city.resources[donationResource]
                }
                onClick={() => donateMutation.mutate()}
              >
                {donateMutation.isPending ? "Processing" : "Donate"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard kicker="Contribution Board" title="Top contributors">
            <div className={styles.rankList}>
              {alliance.contributions.length === 0 ? (
                <EmptyState title="No rankings yet" body="Help, donations, and logistics will fill this board." />
              ) : (
                alliance.contributions.map((entry, index) => (
                  <div key={entry.userId} className={styles.rankRow}>
                    <strong>
                      #{index + 1} {entry.username}
                    </strong>
                    <Badge tone="success">{formatNumber(entry.points)} pts</Badge>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard kicker="Navigation" title="Alliance surfaces">
            <div className={styles.linkStack}>
              <Link className={styles.inlineLink} to="/app/alliance">
                Return to the alliance chamber
              </Link>
              <Link className={styles.inlineLink} to="/app/map">
                Open map markers and battle staging
              </Link>
            </div>
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
