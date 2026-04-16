import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AllianceRole, ResourceKey } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { FeedCardShell, PanelStatGrid, type PanelStatItem } from "../components/ui/CommandSurface";
import { EmptyState } from "../components/ui/EmptyState";
import { PageNotice } from "../components/ui/PageNotice";
import { SectionCard } from "../components/ui/SectionCard";
import { formatDateTime, formatNumber, formatTimeRemaining } from "../lib/formatters";
import { useNow } from "../lib/useNow";
import styles from "./AlliancePage.module.css";

const RESOURCE_OPTIONS: ResourceKey[] = ["wood", "stone", "food", "gold"];

function getRoleTone(role: AllianceRole): "info" | "success" | "warning" {
  if (role === "LEADER") {
    return "success";
  }
  if (role === "OFFICER") {
    return "info";
  }
  return "warning";
}

function canManageAlliance(role: AllianceRole) {
  return role === "LEADER" || role === "OFFICER";
}

function formatResourceLabel(resource: string): string {
  return resource.slice(0, 1).toUpperCase() + resource.slice(1);
}

export function AlliancePage() {
  const now = useNow();
  const queryClient = useQueryClient();
  const { state } = useGameLayoutContext();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerX, setMarkerX] = useState(state.city.coordinates.x);
  const [markerY, setMarkerY] = useState(state.city.coordinates.y);
  const [donationResource, setDonationResource] = useState<ResourceKey>("wood");
  const [donationAmount, setDonationAmount] = useState(120);
  const [notice, setNotice] = useState<string | null>(null);

  const allianceQuery = useQuery({
    queryKey: ["alliance-state"],
    queryFn: api.allianceState,
  });

  const invalidateAlliance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["alliance-state"] }),
      queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      queryClient.invalidateQueries({ queryKey: ["world-chunk"] }),
    ]);
  };

  const createAllianceMutation = useMutation({
    mutationFn: () => api.createAlliance({ name, tag: tag.toUpperCase(), description }),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Alliance banner established.");
      setName("");
      setTag("");
      setDescription("");
    },
  });

  const joinAllianceMutation = useMutation({
    mutationFn: (allianceId: string) => api.joinAlliance(allianceId),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Alliance join confirmed.");
    },
  });

  const leaveAllianceMutation = useMutation({
    mutationFn: api.leaveAlliance,
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("You left the alliance.");
    },
  });

  const sendChatMutation = useMutation({
    mutationFn: () => api.sendAllianceChat(chatMessage),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Alliance message sent.");
      setChatMessage("");
    },
  });

  const donateMutation = useMutation({
    mutationFn: () =>
      api.donateAllianceResources({
        wood: donationResource === "wood" ? donationAmount : 0,
        stone: donationResource === "stone" ? donationAmount : 0,
        food: donationResource === "food" ? donationAmount : 0,
        gold: donationResource === "gold" ? donationAmount : 0,
      }),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Alliance treasury updated.");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AllianceRole }) => api.updateAllianceRole(userId, role),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Role assignments updated.");
    },
  });

  const requestHelpMutation = useMutation({
    mutationFn: (kind: "BUILDING_UPGRADE" | "TRAINING" | "RESEARCH") => api.requestAllianceHelp(kind),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Help request posted to the board.");
    },
  });

  const respondHelpMutation = useMutation({
    mutationFn: (helpRequestId: string) => api.respondAllianceHelp(helpRequestId),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Support sent.");
    },
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: () => api.updateAllianceAnnouncement(announcementDraft),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Announcement updated.");
    },
  });

  const createMarkerMutation = useMutation({
    mutationFn: () => api.createAllianceMarker({ label: markerLabel, x: markerX, y: markerY }),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Map marker added.");
      setMarkerLabel("");
    },
  });

  const deleteMarkerMutation = useMutation({
    mutationFn: (markerId: string) => api.deleteAllianceMarker(markerId),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Map marker removed.");
    },
  });

  const alliance = allianceQuery.data?.alliance ?? null;
  const publicAlliances = allianceQuery.data?.alliances ?? [];
  const requestableHelp = useMemo(
    () => [
      {
        kind: "BUILDING_UPGRADE" as const,
        label: "Build Help",
        enabled: Boolean(state.city.activeUpgrade),
      },
      {
        kind: "TRAINING" as const,
        label: "Training Help",
        enabled: Boolean(state.city.activeTraining),
      },
      {
        kind: "RESEARCH" as const,
        label: "Research Help",
        enabled: Boolean(state.city.activeResearch),
      },
    ],
    [state.city.activeResearch, state.city.activeTraining, state.city.activeUpgrade],
  );
  const contributionByUserId = useMemo(
    () => new Map((alliance?.contributions ?? []).map((entry) => [entry.userId, entry.points])),
    [alliance?.contributions],
  );
  const treasuryTotal = alliance ? Object.values(alliance.treasury).reduce((sum, value) => sum + value, 0) : 0;
  const latestDonation = alliance?.donations[0] ?? null;
  const treasuryStats: PanelStatItem[] = alliance
    ? [
        {
          id: "reserve",
          label: "Reserve",
          value: formatNumber(treasuryTotal),
          note: "shared war stock",
          tone: "success",
        },
        {
          id: "city-stock",
          label: "City Stock",
          value: formatNumber(state.city.resources[donationResource]),
          note: formatResourceLabel(donationResource),
          tone: "info",
        },
        {
          id: "latest-convoy",
          label: "Latest Convoy",
          value: latestDonation ? latestDonation.username : "Pending",
          note: latestDonation ? `${formatNumber(latestDonation.totalValue)} value` : "awaiting first ledger entry",
          tone: "warning",
        },
        {
          id: "support-queue",
          label: "Support Queue",
          value: formatNumber(alliance.helpRequests.length),
          note: "open accelerations",
        },
      ]
    : [];
  const contributionStats: PanelStatItem[] = alliance
    ? [
        {
          id: "top-score",
          label: "Lead Score",
          value: formatNumber(alliance.contributions[0]?.points ?? 0),
          note: alliance.contributions[0]?.username ?? "No scorer yet",
          tone: "warning",
        },
        {
          id: "active-donors",
          label: "Active Donors",
          value: formatNumber(alliance.contributions.length),
          note: "members on the ledger",
          tone: "info",
        },
      ]
    : [];
  const markerStats: PanelStatItem[] = alliance
    ? [
        {
          id: "pins",
          label: "Pins",
          value: formatNumber(alliance.markers.length),
          note: "live map directives",
          tone: "info",
        },
        {
          id: "expiring-pins",
          label: "Expiring",
          value: formatNumber(alliance.markers.filter((marker) => marker.expiresAt != null).length),
          note: "timed beacons",
          tone: "warning",
        },
      ]
    : [];
  const chronicleStats: PanelStatItem[] = alliance
    ? [
        {
          id: "entries",
          label: "Entries",
          value: formatNumber(alliance.logs.length),
          note: "recent alliance events",
          tone: "info",
        },
        {
          id: "latest-kind",
          label: "Latest",
          value: alliance.logs[0]?.kind.replaceAll("_", " ") ?? "Quiet",
          note: alliance.logs[0] ? formatDateTime(alliance.logs[0].createdAt) : "awaiting first chronicle entry",
          tone: "success",
        },
      ]
    : [];
  const supportStats: PanelStatItem[] = alliance
    ? [
        {
          id: "open-help",
          label: "Open",
          value: formatNumber(alliance.helpRequests.filter((request) => request.isOpen).length),
          note: "requests awaiting aid",
          tone: "warning",
        },
        {
          id: "closed-help",
          label: "Resolved",
          value: formatNumber(alliance.helpRequests.filter((request) => !request.isOpen).length),
          note: "support cycles closed",
          tone: "success",
        },
      ]
    : [];

  useEffect(() => {
    if (!alliance) {
      setAnnouncementDraft("");
      return;
    }

    setAnnouncementDraft(alliance.announcement ?? "");
  }, [alliance]);

  useEffect(() => {
    setMarkerX(state.city.coordinates.x);
    setMarkerY(state.city.coordinates.y);
  }, [state.city.coordinates.x, state.city.coordinates.y]);

  if (allianceQuery.isPending) {
    return (
      <section className={styles.page}>
        <PageNotice title="Loading alliance chamber" body="Roster, directives, support queue, and marker ledgers are still being assembled." />
      </section>
    );
  }

  if (allianceQuery.isError) {
    return (
      <section className={styles.page}>
        <PageNotice
          title="Alliance chamber could not be loaded"
          body="Alliance state is unavailable right now. Retry once membership and realtime state settle."
          tone="danger"
        />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroPanel}>
          <div className={styles.heroLeadBlock}>
            <p className={styles.kicker}>Grand Alliance</p>
            <h2 className={styles.heroTitle}>{alliance ? alliance.name : "Open Diplomacy"}</h2>
            <div className={styles.heroMeta}>
              <Badge tone={alliance ? getRoleTone(alliance.role) : "info"}>{alliance ? alliance.role : "Seeking Banner"}</Badge>
              {alliance ? <span className={styles.heroMetaItem}>[{alliance.tag}]</span> : null}
              <span className={styles.heroMetaItem}>{alliance ? `${alliance.memberCount} sworn banners` : "Create or join a house"}</span>
            </div>
            <p className={styles.heroLead}>
              {alliance
                ? alliance.description ?? "Shared war doctrine, logistics, and member rhythm live in this chamber."
                : "Create a new alliance house or join an open banner to unlock treasury, help, and live coordination."}
            </p>
          </div>

          <aside className={styles.noticeCard}>
            <span className={styles.noticeEyebrow}>Command Signal</span>
            <strong className={styles.noticeTitle}>{alliance ? "Alliance directives online" : "Banner search open"}</strong>
            <p className={styles.noticeBody}>
              {notice ??
                (alliance
                  ? "Announcements, support requests, map pins, and treasury actions are staged from one organized surface."
                  : "No alliance active. Create a banner or review open houses below.")}
            </p>
          </aside>
        </div>

        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Members</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.memberCount ?? publicAlliances.length)}</strong>
            <span className={styles.summaryHint}>sworn banners</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Support Queue</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.helpRequests.length ?? 0)}</strong>
            <span className={styles.summaryHint}>open accelerations</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Field Dispatches</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.chatMessages.length ?? 0)}</strong>
            <span className={styles.summaryHint}>live channel notes</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Treasury Reserve</span>
            <strong className={styles.summaryValue}>{formatNumber(treasuryTotal)}</strong>
            <span className={styles.summaryHint}>shared strategic stock</span>
          </article>
        </div>
      </header>

      {alliance ? (
        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <SectionCard
              kicker="Vanguard Roster"
              title="Sworn banners"
              aside={<Link className={styles.inlineLink} to="/app/alliance/roles">Open role management</Link>}
            >
              <div className={styles.rosterTableHead}>
                <span>Member</span>
                <span>Rank</span>
                <span>Contribution</span>
                <span>Status</span>
              </div>
              <div className={styles.rosterList}>
                {alliance.members.map((member) => {
                  const contribution = contributionByUserId.get(member.userId) ?? 0;

                  return (
                    <article key={member.userId} className={styles.rosterRow}>
                      <div className={styles.memberCell}>
                        <strong>{member.username}</strong>
                        <span>{member.cityName}</span>
                      </div>
                      <div className={styles.roleCell}>
                        <Badge tone={getRoleTone(member.role)}>{member.role}</Badge>
                      </div>
                      <div className={styles.scoreCell}>{formatNumber(contribution)}</div>
                      <div className={styles.statusCell}>{member.userId === state.player.id ? "You" : "Active"}</div>
                      {alliance.role === "LEADER" && member.userId !== state.player.id ? (
                        <div className={styles.rosterActions}>
                          {member.role !== "OFFICER" ? (
                            <Button
                              type="button"
                              size="small"
                              variant="secondary"
                              disabled={updateRoleMutation.isPending}
                              onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: "OFFICER" })}
                            >
                              Promote Officer
                            </Button>
                          ) : null}
                          {member.role !== "MEMBER" ? (
                            <Button
                              type="button"
                              size="small"
                              variant="ghost"
                              disabled={updateRoleMutation.isPending}
                              onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: "MEMBER" })}
                            >
                              Set Member
                            </Button>
                          ) : null}
                          {member.role !== "LEADER" ? (
                            <Button
                              type="button"
                              size="small"
                              variant="secondary"
                              disabled={updateRoleMutation.isPending}
                              onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: "LEADER" })}
                            >
                              Transfer Leadership
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard
              kicker="Command Board"
              title="Alliance directives"
              aside={<Badge tone="info">{alliance.markers.length} map pins</Badge>}
            >
              <div className={styles.stack}>
                <textarea
                  className={styles.textArea}
                  value={announcementDraft}
                  maxLength={220}
                  onChange={(event) => setAnnouncementDraft(event.target.value)}
                  placeholder="Write today's doctrine, rally route, or defense order."
                />
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!canManageAlliance(alliance.role) || updateAnnouncementMutation.isPending}
                    onClick={() => updateAnnouncementMutation.mutate()}
                  >
                    {!canManageAlliance(alliance.role) ? "Read Only" : "Save Announcement"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    disabled={leaveAllianceMutation.isPending}
                    onClick={() => leaveAllianceMutation.mutate()}
                  >
                    {leaveAllianceMutation.isPending ? "Leaving" : "Leave Alliance"}
                  </Button>
                </div>
                <div className={styles.inlineForm}>
                  <input
                    className={styles.textField}
                    value={markerLabel}
                    maxLength={48}
                    onChange={(event) => setMarkerLabel(event.target.value)}
                    placeholder="New map marker"
                  />
                  <input
                    className={styles.textField}
                    type="number"
                    value={markerX}
                    onChange={(event) => setMarkerX(Number(event.target.value))}
                    aria-label="Marker X"
                  />
                  <input
                    className={styles.textField}
                    type="number"
                    value={markerY}
                    onChange={(event) => setMarkerY(Number(event.target.value))}
                    aria-label="Marker Y"
                  />
                  <Button
                    type="button"
                    disabled={markerLabel.trim().length < 3 || createMarkerMutation.isPending}
                    onClick={() => createMarkerMutation.mutate()}
                  >
                    Drop Marker
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard kicker="Support Queue" title="Acceleration and aid">
              <PanelStatGrid items={supportStats} columns={2} compact className={styles.railStats} />
              <div className={styles.helpGrid}>
                {requestableHelp.map((entry) => (
                  <Button
                    key={entry.kind}
                    type="button"
                    variant={entry.enabled ? "secondary" : "ghost"}
                    disabled={!entry.enabled || requestHelpMutation.isPending}
                    onClick={() => requestHelpMutation.mutate(entry.kind)}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>
              <div className={styles.feedList}>
                {alliance.helpRequests.length === 0 ? (
                  <EmptyState
                    title="No Open Requests"
                    body="When a build, training, or research queue is active, help orders appear here."
                  />
                ) : (
                  alliance.helpRequests.map((request) => (
                    <FeedCardShell
                      key={request.id}
                      title={request.label}
                      meta={<Badge tone={request.isOpen ? "warning" : "success"}>{request.helpCount}/{request.maxHelps}</Badge>}
                      body={`${request.requesterName} | ${request.kind.replaceAll("_", " ").toLowerCase()}`}
                      footer={
                        <div className={styles.actions}>
                          <Button
                            type="button"
                            size="small"
                            disabled={respondHelpMutation.isPending || request.requesterUserId === state.player.id || !request.isOpen}
                            onClick={() => respondHelpMutation.mutate(request.id)}
                          >
                            {request.requesterUserId === state.player.id ? "Your Request" : "Send Help"}
                          </Button>
                        </div>
                      }
                      tone={request.isOpen ? "warning" : "success"}
                    />
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard kicker="Alliance Channel" title="Field dispatch" aside={<Badge tone="info">Live</Badge>}>
              <div className={styles.inlineComposer}>
                <input
                  className={styles.textField}
                  value={chatMessage}
                  maxLength={240}
                  onChange={(event) => setChatMessage(event.target.value)}
                  placeholder="Share the plan, call for support, or mark a target."
                />
                <Button
                  type="button"
                  disabled={sendChatMutation.isPending || chatMessage.trim().length === 0}
                  onClick={() => sendChatMutation.mutate()}
                >
                  {sendChatMutation.isPending ? "Sending" : "Send"}
                </Button>
              </div>
              <div className={styles.feedList}>
                {alliance.chatMessages.length === 0 ? (
                  <EmptyState title="Quiet Channel" body="Write the first order and set the field rhythm from here." />
                ) : (
                  alliance.chatMessages.map((message) => (
                    <FeedCardShell
                      key={message.id}
                      title={message.username}
                      meta={formatDateTime(message.createdAt)}
                      body={message.content}
                      tone="info"
                    />
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          <aside className={styles.sideColumn}>
            <SectionCard kicker="Strategic Treasury" title="Shared reserve" aside={<Badge tone="success">Active</Badge>}>
              <PanelStatGrid items={treasuryStats} columns={2} compact className={styles.railStats} />
              <div className={styles.treasuryTotal}>
                <span>Total reserve</span>
                <strong>{formatNumber(treasuryTotal)}</strong>
              </div>
              <dl className={styles.definitionGrid}>
                {Object.entries(alliance.treasury).map(([resource, amount]) => (
                  <div key={resource}>
                    <dt>{formatResourceLabel(resource)}</dt>
                    <dd>{formatNumber(amount)}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.inlineFormCompact}>
                <select value={donationResource} onChange={(event) => setDonationResource(event.target.value as ResourceKey)}>
                  {RESOURCE_OPTIONS.map((resource) => (
                    <option key={resource} value={resource}>
                      {formatResourceLabel(resource)}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.textField}
                  type="number"
                  min={10}
                  max={5000}
                  value={donationAmount}
                  onChange={(event) => setDonationAmount(Number(event.target.value))}
                />
              </div>
              <p className={styles.mutedText}>
                City stock: {formatNumber(state.city.resources[donationResource])} {donationResource}
              </p>
              {latestDonation ? (
                <p className={styles.mutedText}>Latest convoy: {latestDonation.username} delivered {formatNumber(latestDonation.totalValue)} total value.</p>
              ) : null}
              <Button
                type="button"
                disabled={donateMutation.isPending || donationAmount < 1 || donationAmount > state.city.resources[donationResource]}
                onClick={() => donateMutation.mutate()}
              >
                {donateMutation.isPending ? "Processing" : "Donate to Treasury"}
              </Button>
            </SectionCard>

            <SectionCard kicker="Contribution Rank" title="Top contributors">
              <PanelStatGrid items={contributionStats} columns={2} compact className={styles.railStats} />
              <div className={styles.feedList}>
                {alliance.contributions.length === 0 ? (
                  <EmptyState title="No Score Yet" body="Donation and aid actions fill the contribution table." />
                ) : (
                  alliance.contributions.slice(0, 6).map((entry, index) => (
                    <FeedCardShell
                      key={entry.userId}
                      title={`#${index + 1} ${entry.username}`}
                      meta={`${formatNumber(entry.points)} points`}
                      tone={index === 0 ? "warning" : "info"}
                    />
                  ))
                )}
              </div>
            </SectionCard>

            {(() => {
              const embassy = state.city.buildings.find((building) => building.type === "EMBASSY");
              if (!embassy) return null;
              const helpSlots = Math.max(3, embassy.level + 2);
              const maxMembers = Math.min(12, 8 + embassy.level);
              return (
                <SectionCard
                  kicker="Embassy"
                  title="Diplomatic standing"
                  aside={<Badge tone="info">L{embassy.level}</Badge>}
                >
                  <div>
                    <div className={styles.embassyStatRow}>
                      <span className={styles.mutedText}>Aid request slots</span>
                      <strong>{helpSlots}</strong>
                    </div>
                    <div className={styles.embassyStatRow}>
                      <span className={styles.mutedText}>Max alliance members</span>
                      <strong>{maxMembers}</strong>
                    </div>
                    <p className={styles.mutedText}>
                      Upgrade the Embassy to unlock more aid slots and expand the alliance roster capacity.
                    </p>
                  </div>
                </SectionCard>
              );
            })()}

            <SectionCard kicker="War Markers" title="Active pins">
              <PanelStatGrid items={markerStats} columns={2} compact className={styles.railStats} />
              <div className={styles.feedList}>
                {alliance.markers.length === 0 ? (
                  <EmptyState title="No Markers" body="Lock rally, defense, and target points here." />
                ) : (
                  alliance.markers.slice(0, 6).map((marker) => (
                    <FeedCardShell
                      key={marker.id}
                      title={marker.label}
                      meta={`${marker.x}, ${marker.y}`}
                      body={`${formatDateTime(marker.createdAt)}${
                        marker.expiresAt ? ` | expires in ${formatTimeRemaining(marker.expiresAt, now)}` : ""
                      }`}
                      footer={
                        marker.canDelete ? (
                          <div className={styles.actions}>
                            <span>{marker.createdByUserId === state.player.id ? "Your marker" : "Officer action"}</span>
                            <Button
                              type="button"
                              size="small"
                              variant="ghost"
                              disabled={deleteMarkerMutation.isPending}
                              onClick={() => deleteMarkerMutation.mutate(marker.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : null
                      }
                      tone="info"
                    />
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard kicker="Chronicle" title="Recent events" aside={<Badge tone="info">{alliance.logs.length} entries</Badge>}>
              <PanelStatGrid items={chronicleStats} columns={2} compact className={styles.railStats} />
              <div className={styles.feedList}>
                {alliance.logs.length === 0 ? (
                  <EmptyState title="Log Empty" body="New aid, donation, and diplomacy actions will land here." />
                ) : (
                  alliance.logs.slice(0, 6).map((entry) => (
                    <FeedCardShell
                      key={entry.id}
                      title={entry.kind.replaceAll("_", " ")}
                      meta={formatDateTime(entry.createdAt)}
                      body={entry.body}
                      tone="info"
                    />
                  ))
                )}
              </div>
            </SectionCard>
          </aside>
        </div>
      ) : (
        <div className={styles.emptyLayout}>
          <SectionCard kicker="New Banner" title="Create alliance house">
            <div className={styles.stack}>
              <input
                className={styles.textField}
                value={name}
                maxLength={32}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alliance name"
              />
              <input
                className={styles.textField}
                value={tag}
                maxLength={6}
                onChange={(event) => setTag(event.target.value.toUpperCase())}
                placeholder="Tag"
              />
              <textarea
                className={styles.textArea}
                value={description}
                maxLength={180}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short doctrine note"
              />
              <Button
                type="button"
                disabled={createAllianceMutation.isPending || name.trim().length < 3 || tag.trim().length < 2}
                onClick={() => createAllianceMutation.mutate()}
              >
                {createAllianceMutation.isPending ? "Creating" : "Create Alliance"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard kicker="Open Banners" title="Join alliance house">
            <div className={styles.feedList}>
              {publicAlliances.length === 0 ? (
                <EmptyState title="List Empty" body="No visible alliance is available yet." />
              ) : (
                publicAlliances.map((entry) => (
                  <FeedCardShell
                    key={entry.id}
                    title={entry.name}
                    meta={<Badge tone="info">[{entry.tag}]</Badge>}
                    body={entry.description || "Doctrine note has not been set."}
                    footer={
                      <div className={styles.actions}>
                        <span>{entry.memberCount} members</span>
                        <Button
                          type="button"
                          size="small"
                          disabled={joinAllianceMutation.isPending || entry.joined}
                          onClick={() => joinAllianceMutation.mutate(entry.id)}
                        >
                          {entry.joined ? "Joined" : "Join"}
                        </Button>
                      </div>
                    }
                    tone={entry.joined ? "success" : "info"}
                  />
                ))
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </section>
  );
}

