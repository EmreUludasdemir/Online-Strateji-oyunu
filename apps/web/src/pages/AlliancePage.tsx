import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AllianceRole, ResourceKey } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
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
    return <div className={styles.feedback}>Loading alliance chamber...</div>;
  }

  if (allianceQuery.isError) {
    return <div className={styles.feedback}>Alliance chamber could not be loaded.</div>;
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>Alliance Chamber</p>
            <h2 className={styles.heroTitle}>{alliance ? `${alliance.name} [${alliance.tag}]` : "Open Diplomacy"}</h2>
            <p className={styles.heroLead}>
              Member coordination, the help board, map markers, and the shared treasury stay in one command layer.
            </p>
          </div>
          <Badge tone={alliance ? getRoleTone(alliance.role) : "info"}>
            {alliance ? alliance.role : "Seeking Banner"}
          </Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Members</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.memberCount ?? publicAlliances.length)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Help</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.helpRequests.length ?? 0)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Messages</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.chatMessages.length ?? 0)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Treasury</span>
            <strong className={styles.summaryValue}>
              {formatNumber(alliance ? Object.values(alliance.treasury).reduce((sum, value) => sum + value, 0) : 0)}
            </strong>
          </article>
        </div>
        <div className={styles.notice}>
          {notice ??
            (alliance
              ? "Field coordination, support, logistics, and chat stay in one place."
              : "Create a new alliance or join one of the open banners.")}
        </div>
      </header>

      {alliance ? (
        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <SectionCard
              kicker="Command Board"
              title="Announcements and Routes"
              aside={<Badge tone="info">{alliance.markers.length} markers</Badge>}
            >
              <div className={styles.stack}>
                <textarea
                  className={styles.textArea}
                  value={announcementDraft}
                  maxLength={220}
                  onChange={(event) => setAnnouncementDraft(event.target.value)}
                  placeholder="Write today's focus, rally route, or defense order."
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
                  <Link className={styles.inlineLink} to="/app/alliance/roles">
                    Open role management
                  </Link>
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

            <SectionCard kicker="Field Chat" title="Alliance Channel" aside={<Badge tone="info">Live</Badge>}>
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
                    <article key={message.id} className={styles.feedCard}>
                      <div className={styles.feedMeta}>
                        <strong>{message.username}</strong>
                        <span>{formatDateTime(message.createdAt)}</span>
                      </div>
                      <p>{message.content}</p>
                    </article>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard kicker="Help Board" title="Queue Acceleration">
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
                    body="When a build, training, or research queue is active, help opens here."
                  />
                ) : (
                  alliance.helpRequests.map((request) => (
                    <article key={request.id} className={styles.feedCard}>
                      <div className={styles.feedMeta}>
                        <strong>{request.label}</strong>
                        <Badge tone={request.isOpen ? "warning" : "success"}>{request.helpCount}/{request.maxHelps}</Badge>
                      </div>
                      <p>
                        {request.requesterName} | {request.kind.replaceAll("_", " ").toLowerCase()}
                      </p>
                      <div className={styles.actions}>
                        <Button
                          type="button"
                          size="small"
                          disabled={
                            respondHelpMutation.isPending || request.requesterUserId === state.player.id || !request.isOpen
                          }
                          onClick={() => respondHelpMutation.mutate(request.id)}
                        >
                          {request.requesterUserId === state.player.id ? "Your Request" : "Send Help"}
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard kicker="Activity Log" title="Latest Events" aside={<Badge tone="info">{alliance.logs.length} entries</Badge>}>
              <div className={styles.feedList}>
                {alliance.logs.length === 0 ? (
                  <EmptyState title="Log Empty" body="New aid, donation, and diplomacy actions will land here." />
                ) : (
                  alliance.logs.slice(0, 6).map((entry) => (
                    <article key={entry.id} className={styles.feedCard}>
                      <div className={styles.feedMeta}>
                        <strong>{entry.kind.replaceAll("_", " ")}</strong>
                        <span>{formatDateTime(entry.createdAt)}</span>
                      </div>
                      <p>{entry.body}</p>
                    </article>
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          <aside className={styles.sideColumn}>
            <SectionCard kicker="Treasury" title="Shared Stock" aside={<Badge tone="success">Active</Badge>}>
              <dl className={styles.definitionGrid}>
                {Object.entries(alliance.treasury).map(([resource, amount]) => (
                  <div key={resource}>
                    <dt>{formatResourceLabel(resource)}</dt>
                    <dd>{formatNumber(amount)}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.inlineForm}>
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
              <Button
                type="button"
                disabled={
                  donateMutation.isPending ||
                  donationAmount < 1 ||
                  donationAmount > state.city.resources[donationResource]
                }
                onClick={() => donateMutation.mutate()}
              >
                {donateMutation.isPending ? "Processing" : "Donate to Treasury"}
              </Button>
            </SectionCard>

            <SectionCard kicker="Contribution Score" title="Leadership Ranking">
              <div className={styles.feedList}>
                {alliance.contributions.length === 0 ? (
                  <EmptyState title="No Score Yet" body="Donation and aid actions fill the contribution table." />
                ) : (
                  alliance.contributions.slice(0, 6).map((entry, index) => (
                    <article key={entry.userId} className={styles.feedCard}>
                      <div className={styles.feedMeta}>
                        <strong>#{index + 1} {entry.username}</strong>
                        <span>{formatNumber(entry.points)} points</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard kicker="Markers" title="Map Pins">
              <div className={styles.feedList}>
                {alliance.markers.length === 0 ? (
                  <EmptyState title="No Markers" body="Lock rally, defense, and target points here." />
                ) : (
                  alliance.markers.slice(0, 6).map((marker) => (
                    <article key={marker.id} className={styles.feedCard}>
                      <div className={styles.feedMeta}>
                        <strong>{marker.label}</strong>
                        <span>{marker.x}, {marker.y}</span>
                      </div>
                      <p>
                        {formatDateTime(marker.createdAt)}
                        {marker.expiresAt ? ` · expires in ${formatTimeRemaining(marker.expiresAt, now)}` : ""}
                      </p>
                      {marker.canDelete ? (
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
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard
              kicker="Roster"
              title="Member List"
              aside={
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  disabled={leaveAllianceMutation.isPending}
                  onClick={() => leaveAllianceMutation.mutate()}
                >
                  {leaveAllianceMutation.isPending ? "Leaving" : "Leave"}
                </Button>
              }
            >
              <div className={styles.feedList}>
                {alliance.members.map((member) => (
                  <article key={member.userId} className={styles.feedCard}>
                    <div className={styles.feedMeta}>
                      <strong>{member.username}</strong>
                      <Badge tone={getRoleTone(member.role)}>{member.role}</Badge>
                    </div>
                    <p>{member.cityName}</p>
                    {alliance.role === "LEADER" && member.userId !== state.player.id ? (
                      <div className={styles.helpGrid}>
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
                ))}
              </div>
            </SectionCard>
          </aside>
        </div>
      ) : (
        <div className={styles.emptyLayout}>
          <SectionCard kicker="New Banner" title="Create Alliance">
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

          <SectionCard kicker="Open Banners" title="Join Alliance">
            <div className={styles.feedList}>
              {publicAlliances.length === 0 ? (
                <EmptyState title="List Empty" body="No visible alliance is available yet." />
              ) : (
                publicAlliances.map((entry) => (
                  <article key={entry.id} className={styles.feedCard}>
                    <div className={styles.feedMeta}>
                      <strong>{entry.name}</strong>
                      <Badge tone="info">[{entry.tag}]</Badge>
                    </div>
                    <p>{entry.description || "Doctrine note has not been set."}</p>
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
                  </article>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </section>
  );
}
