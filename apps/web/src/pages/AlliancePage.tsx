import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AllianceRole, ResourceKey } from "@frontier/shared";
import { useMemo, useState } from "react";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import styles from "../components/GameLayout.module.css";
import { formatNumber } from "../lib/formatters";

const RESOURCE_OPTIONS: ResourceKey[] = ["wood", "stone", "food", "gold"];

export function AlliancePage() {
  const queryClient = useQueryClient();
  const { state } = useGameLayoutContext();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [chatMessage, setChatMessage] = useState("");
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
    ]);
  };

  const createAllianceMutation = useMutation({
    mutationFn: () => api.createAlliance({ name, tag: tag.toUpperCase(), description }),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Alliance charter approved.");
      setName("");
      setTag("");
      setDescription("");
    },
  });

  const joinAllianceMutation = useMutation({
    mutationFn: (allianceId: string) => api.joinAlliance(allianceId),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Alliance membership accepted.");
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
      setNotice("Alliance role updated.");
    },
  });

  const requestHelpMutation = useMutation({
    mutationFn: (kind: "BUILDING_UPGRADE" | "TRAINING" | "RESEARCH") => api.requestAllianceHelp(kind),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Alliance help request posted.");
    },
  });

  const respondHelpMutation = useMutation({
    mutationFn: (helpRequestId: string) => api.respondAllianceHelp(helpRequestId),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Help sent to your ally.");
    },
  });

  const alliance = allianceQuery.data?.alliance ?? null;
  const publicAlliances = allianceQuery.data?.alliances ?? [];
  const requestableHelp = useMemo(
    () => [
      {
        kind: "BUILDING_UPGRADE" as const,
        label: "Construction help",
        enabled: Boolean(state.city.activeUpgrade),
      },
      {
        kind: "TRAINING" as const,
        label: "Training help",
        enabled: Boolean(state.city.activeTraining),
      },
      {
        kind: "RESEARCH" as const,
        label: "Research help",
        enabled: Boolean(state.city.activeResearch),
      },
    ],
    [state.city.activeResearch, state.city.activeTraining, state.city.activeUpgrade],
  );

  if (allianceQuery.isPending) {
    return <div className={styles.feedbackCard}>Loading alliance diplomacy...</div>;
  }

  if (allianceQuery.isError) {
    return <div className={styles.feedbackCard}>Unable to load alliance diplomacy.</div>;
  }

  return (
    <section className={styles.pageGrid}>
      <article className={styles.heroCard}>
        <div className={styles.heroTopline}>
          <div>
            <p className={styles.sectionKicker}>Alliance chamber</p>
            <h2>{alliance ? `${alliance.name} [${alliance.tag}]` : "No alliance charter yet"}</h2>
            <p className={styles.heroLead}>
              Coordinate members, accelerate build queues, and fund a shared war chest while your frontier city
              continues to grow.
            </p>
          </div>
          <span className={styles.levelBadge}>{alliance ? `${alliance.memberCount} members` : "Open diplomacy"}</span>
        </div>
        {notice ? (
          <div className={styles.statusStrip}>{notice}</div>
        ) : alliance ? (
          <div className={styles.statusStrip}>
            Your current role is {alliance.role.toLowerCase()}. Treasury, role updates, and help requests are
            synchronized from the server.
          </div>
        ) : (
          <div className={styles.statusStrip}>
            Create a new banner or join an existing alliance to unlock treasury, help requests, and alliance chat.
          </div>
        )}
      </article>

      {alliance ? (
        <>
          <section className={styles.commandDeck}>
            <article className={styles.commandCard}>
              <p className={styles.sectionKicker}>Alliance role</p>
              <strong className={styles.commandValue}>{alliance.role}</strong>
              <p className={styles.commandHint}>Leadership can redirect roles and treasury for faster expansion.</p>
            </article>
            <article className={styles.commandCard}>
              <p className={styles.sectionKicker}>Open help</p>
              <strong className={styles.commandValue}>{formatNumber(alliance.helpRequests.length)}</strong>
              <p className={styles.commandHint}>Help requests shave time off active build, drill, and research queues.</p>
            </article>
            <article className={styles.commandCard}>
              <p className={styles.sectionKicker}>Channel flow</p>
              <strong className={styles.commandValue}>{formatNumber(alliance.chatMessages.length)}</strong>
              <p className={styles.commandHint}>Recent alliance messages remain visible to the whole roster.</p>
            </article>
            <article className={styles.commandCard}>
              <p className={styles.sectionKicker}>Treasury total</p>
              <strong className={styles.commandValue}>
                {formatNumber(Object.values(alliance.treasury).reduce((sum, value) => sum + value, 0))}
              </strong>
              <p className={styles.commandHint}>Shared stores for future alliance systems and donation pressure.</p>
            </article>
          </section>

          <section className={styles.cardGrid}>
            <article className={styles.buildingCard}>
              <div className={styles.buildingHeader}>
                <div>
                  <p className={styles.sectionKicker}>Treasury</p>
                  <h3>Alliance stores</h3>
                </div>
                <span className={styles.levelBadge}>Shared stock</span>
              </div>
              <dl className={styles.costGrid}>
                {Object.entries(alliance.treasury).map(([resource, amount]) => (
                  <div key={resource}>
                    <dt>{resource}</dt>
                    <dd>{formatNumber(amount)}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.inlineForm}>
                <select value={donationResource} onChange={(event) => setDonationResource(event.target.value as ResourceKey)}>
                  {RESOURCE_OPTIONS.map((resource) => (
                    <option key={resource} value={resource}>
                      {resource}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  value={donationAmount}
                  onChange={(event) => setDonationAmount(Number(event.target.value))}
                />
              </div>
              <p className={styles.buildingText}>
                Current city stock: {formatNumber(state.city.resources[donationResource])} {donationResource}
              </p>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={
                  donateMutation.isPending ||
                  donationAmount < 1 ||
                  donationAmount > state.city.resources[donationResource]
                }
                onClick={() => donateMutation.mutate()}
              >
                {donateMutation.isPending ? "Donating..." : "Donate to treasury"}
              </button>
            </article>

            <article className={styles.buildingCard}>
              <div className={styles.buildingHeader}>
                <div>
                  <p className={styles.sectionKicker}>Roster</p>
                  <h3>Alliance members</h3>
                </div>
                <button
                  className={styles.subtleButton}
                  type="button"
                  disabled={leaveAllianceMutation.isPending}
                  onClick={() => leaveAllianceMutation.mutate()}
                >
                  {leaveAllianceMutation.isPending ? "Leaving..." : "Leave alliance"}
                </button>
              </div>
              <div className={styles.cardStack}>
                {alliance.members.map((member) => (
                  <article key={member.userId} className={styles.commandCard}>
                    <p className={styles.sectionKicker}>{member.role}</p>
                    <strong className={styles.commandValue}>{member.username}</strong>
                    <p className={styles.commandHint}>{member.cityName}</p>
                    {alliance.role === "LEADER" && member.userId !== state.player.id ? (
                      <div className={styles.cardStack}>
                        {member.role !== "OFFICER" ? (
                          <button
                            className={styles.subtleButton}
                            type="button"
                            disabled={updateRoleMutation.isPending}
                            onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: "OFFICER" })}
                          >
                            <span>Promote officer</span>
                            <small>Queue help ops</small>
                          </button>
                        ) : null}
                        {member.role !== "MEMBER" ? (
                          <button
                            className={styles.subtleButton}
                            type="button"
                            disabled={updateRoleMutation.isPending}
                            onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: "MEMBER" })}
                          >
                            <span>Set member</span>
                            <small>Remove elevated role</small>
                          </button>
                        ) : null}
                        {member.role !== "LEADER" ? (
                          <button
                            className={styles.subtleButton}
                            type="button"
                            disabled={updateRoleMutation.isPending}
                            onClick={() => updateRoleMutation.mutate({ userId: member.userId, role: "LEADER" })}
                          >
                            <span>Transfer lead</span>
                            <small>Promote as leader</small>
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </article>
          </section>

          <section className={styles.cardGrid}>
            <article className={styles.buildingCard}>
              <div className={styles.buildingHeader}>
                <div>
                  <p className={styles.sectionKicker}>Help board</p>
                  <h3>Queue acceleration</h3>
                </div>
                <span className={styles.levelBadge}>20s per help</span>
              </div>
              <div className={styles.cardStack}>
                {requestableHelp.map((entry) => (
                  <button
                    key={entry.kind}
                    className={styles.subtleButton}
                    type="button"
                    disabled={!entry.enabled || requestHelpMutation.isPending}
                    onClick={() => requestHelpMutation.mutate(entry.kind)}
                  >
                    <span>{entry.label}</span>
                    <small>{entry.enabled ? "Available" : "No active queue"}</small>
                  </button>
                ))}
              </div>
              <div className={styles.cardStack}>
                {alliance.helpRequests.length === 0 ? (
                  <p className={styles.buildingText}>No open help requests are posted right now.</p>
                ) : (
                  alliance.helpRequests.map((request) => (
                    <article key={request.id} className={styles.commandCard}>
                      <p className={styles.sectionKicker}>{request.kind.replaceAll("_", " ")}</p>
                      <strong className={styles.commandValue}>{request.label}</strong>
                      <p className={styles.commandHint}>
                        {request.requesterName} · {request.helpCount}/{request.maxHelps} helps used
                      </p>
                      <button
                        className={styles.primaryButton}
                        type="button"
                        disabled={
                          respondHelpMutation.isPending || request.requesterUserId === state.player.id || !request.isOpen
                        }
                        onClick={() => respondHelpMutation.mutate(request.id)}
                      >
                        {request.requesterUserId === state.player.id ? "Your request" : "Send help"}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </article>

            <article className={styles.buildingCard}>
              <div className={styles.buildingHeader}>
                <div>
                  <p className={styles.sectionKicker}>Alliance channel</p>
                  <h3>Field chat</h3>
                </div>
                <span className={styles.levelBadge}>Shared feed</span>
              </div>
              <div className={styles.inlineForm}>
                <input
                  value={chatMessage}
                  maxLength={240}
                  onChange={(event) => setChatMessage(event.target.value)}
                  placeholder="Share a plan, request support, or call a target."
                />
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={sendChatMutation.isPending || chatMessage.trim().length === 0}
                  onClick={() => sendChatMutation.mutate()}
                >
                  {sendChatMutation.isPending ? "Sending..." : "Send"}
                </button>
              </div>
              <div className={styles.cardStack}>
                {alliance.chatMessages.length === 0 ? (
                  <p className={styles.buildingText}>Alliance chat is quiet. Post the first order.</p>
                ) : (
                  alliance.chatMessages.map((message) => (
                    <article key={message.id} className={styles.commandCard}>
                      <p className={styles.sectionKicker}>{message.username}</p>
                      <strong className={styles.commandHint}>{message.content}</strong>
                    </article>
                  ))
                )}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className={styles.cardGrid}>
          <article className={styles.buildingCard}>
            <div className={styles.buildingHeader}>
              <div>
                <p className={styles.sectionKicker}>Create banner</p>
                <h3>Found a new alliance</h3>
              </div>
              <span className={styles.levelBadge}>Leadership</span>
            </div>
            <div className={styles.cardStack}>
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
                placeholder="Short alliance doctrine"
              />
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={createAllianceMutation.isPending || name.trim().length < 3 || tag.trim().length < 2}
              onClick={() => createAllianceMutation.mutate()}
            >
              {createAllianceMutation.isPending ? "Founding..." : "Create alliance"}
            </button>
          </article>

          <article className={styles.buildingCard}>
            <div className={styles.buildingHeader}>
              <div>
                <p className={styles.sectionKicker}>Join banner</p>
                <h3>Open alliances</h3>
              </div>
              <span className={styles.levelBadge}>{formatNumber(publicAlliances.length)} listed</span>
            </div>
            <div className={styles.cardStack}>
              {publicAlliances.length === 0 ? (
                <p className={styles.buildingText}>No alliances are visible yet.</p>
              ) : (
                publicAlliances.map((entry) => (
                  <article key={entry.id} className={styles.commandCard}>
                    <p className={styles.sectionKicker}>[{entry.tag}]</p>
                    <strong className={styles.commandValue}>{entry.name}</strong>
                    <p className={styles.commandHint}>
                      {entry.description || "No doctrine note provided."} · {entry.memberCount} members
                    </p>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      disabled={joinAllianceMutation.isPending || entry.joined}
                      onClick={() => joinAllianceMutation.mutate(entry.id)}
                    >
                      {entry.joined ? "Already joined" : "Join alliance"}
                    </button>
                  </article>
                ))
              )}
            </div>
          </article>
        </section>
      )}
    </section>
  );
}
