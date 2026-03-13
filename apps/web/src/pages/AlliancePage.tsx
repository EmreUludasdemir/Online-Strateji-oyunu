import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AllianceRole, ResourceKey } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SectionCard } from "../components/ui/SectionCard";
import { formatDateTime, formatNumber } from "../lib/formatters";
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

export function AlliancePage() {
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
      setNotice("Ittifak sancagi kuruldu.");
      setName("");
      setTag("");
      setDescription("");
    },
  });

  const joinAllianceMutation = useMutation({
    mutationFn: (allianceId: string) => api.joinAlliance(allianceId),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Ittifaka katilim onaylandi.");
    },
  });

  const leaveAllianceMutation = useMutation({
    mutationFn: api.leaveAlliance,
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Ittifaktan ayrildiniz.");
    },
  });

  const sendChatMutation = useMutation({
    mutationFn: () => api.sendAllianceChat(chatMessage),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Ittifak mesaji gonderildi.");
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
      setNotice("Ittifak hazinesi guncellendi.");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AllianceRole }) => api.updateAllianceRole(userId, role),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Rol dagilimi guncellendi.");
    },
  });

  const requestHelpMutation = useMutation({
    mutationFn: (kind: "BUILDING_UPGRADE" | "TRAINING" | "RESEARCH") => api.requestAllianceHelp(kind),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Yardim talebi panoya asildi.");
    },
  });

  const respondHelpMutation = useMutation({
    mutationFn: (helpRequestId: string) => api.respondAllianceHelp(helpRequestId),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Yardim gonderildi.");
    },
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: () => api.updateAllianceAnnouncement(announcementDraft),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Duyuru guncellendi.");
    },
  });

  const createMarkerMutation = useMutation({
    mutationFn: () => api.createAllianceMarker({ label: markerLabel, x: markerX, y: markerY }),
    onSuccess: async () => {
      await invalidateAlliance();
      setNotice("Harita isareti eklendi.");
      setMarkerLabel("");
    },
  });

  const alliance = allianceQuery.data?.alliance ?? null;
  const publicAlliances = allianceQuery.data?.alliances ?? [];
  const requestableHelp = useMemo(
    () => [
      {
        kind: "BUILDING_UPGRADE" as const,
        label: "Insa yardimi",
        enabled: Boolean(state.city.activeUpgrade),
      },
      {
        kind: "TRAINING" as const,
        label: "Talim yardimi",
        enabled: Boolean(state.city.activeTraining),
      },
      {
        kind: "RESEARCH" as const,
        label: "Arastirma yardimi",
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
    return <div className={styles.feedback}>Ittifak odasi yukleniyor...</div>;
  }

  if (allianceQuery.isError) {
    return <div className={styles.feedback}>Ittifak odasi yuklenemedi.</div>;
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>Ittifak odasi</p>
            <h2 className={styles.heroTitle}>{alliance ? `${alliance.name} [${alliance.tag}]` : "Acik diplomasi"}</h2>
            <p className={styles.heroLead}>
              Uye koordinasyonu, yardim panosu, harita isaretleri ve ortak hazine ayni komuta katmaninda toplanir.
            </p>
          </div>
          <Badge tone={alliance ? getRoleTone(alliance.role) : "info"}>
            {alliance ? alliance.role : "Sancak araniyor"}
          </Badge>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Uye</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.memberCount ?? publicAlliances.length)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Yardim</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.helpRequests.length ?? 0)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Mesaj</span>
            <strong className={styles.summaryValue}>{formatNumber(alliance?.chatMessages.length ?? 0)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Hazine</span>
            <strong className={styles.summaryValue}>
              {formatNumber(alliance ? Object.values(alliance.treasury).reduce((sum, value) => sum + value, 0) : 0)}
            </strong>
          </article>
        </div>
        <div className={styles.notice}>{notice ?? (alliance ? "Saha odagi, yardim, lojistik ve sohbet tek yerde tutulur." : "Yeni bir ittifak kurabilir ya da acik sancaklardan birine katilabilirsiniz.")}</div>
      </header>

      {alliance ? (
        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <SectionCard
              kicker="Duyuru ve rota"
              title="Komuta panosu"
              aside={<Badge tone="info">{alliance.markers.length} isaret</Badge>}
            >
              <div className={styles.stack}>
                <textarea
                  className={styles.textArea}
                  value={announcementDraft}
                  maxLength={220}
                  onChange={(event) => setAnnouncementDraft(event.target.value)}
                  placeholder="Bugunun odagini, rally rotasini veya savunma emrini yazin."
                />
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={alliance.role === "MEMBER" || updateAnnouncementMutation.isPending}
                    onClick={() => updateAnnouncementMutation.mutate()}
                  >
                    {alliance.role === "MEMBER" ? "Sadece oku" : "Duyuruyu kaydet"}
                  </Button>
                </div>
                <div className={styles.inlineForm}>
                  <input
                    className={styles.textField}
                    value={markerLabel}
                    maxLength={48}
                    onChange={(event) => setMarkerLabel(event.target.value)}
                    placeholder="Yeni harita isareti"
                  />
                  <input
                    className={styles.textField}
                    type="number"
                    value={markerX}
                    onChange={(event) => setMarkerX(Number(event.target.value))}
                    aria-label="Isaret X"
                  />
                  <input
                    className={styles.textField}
                    type="number"
                    value={markerY}
                    onChange={(event) => setMarkerY(Number(event.target.value))}
                    aria-label="Isaret Y"
                  />
                  <Button
                    type="button"
                    disabled={markerLabel.trim().length < 3 || createMarkerMutation.isPending}
                    onClick={() => createMarkerMutation.mutate()}
                  >
                    Isaret birak
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard kicker="Alan sohbeti" title="Iletisim hatti" aside={<Badge tone="info">Canli</Badge>}>
              <div className={styles.inlineComposer}>
                <input
                  className={styles.textField}
                  value={chatMessage}
                  maxLength={240}
                  onChange={(event) => setChatMessage(event.target.value)}
                  placeholder="Plan paylas, destek iste veya hedef cagir."
                />
                <Button
                  type="button"
                  disabled={sendChatMutation.isPending || chatMessage.trim().length === 0}
                  onClick={() => sendChatMutation.mutate()}
                >
                  {sendChatMutation.isPending ? "Gidiyor" : "Gonder"}
                </Button>
              </div>
              <div className={styles.feedList}>
                {alliance.chatMessages.length === 0 ? (
                  <EmptyState title="Sohbet sessiz" body="Ilk emri yazin ve saha ritmini buradan kurun." />
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

            <SectionCard kicker="Yardim panosu" title="Sira hizlandirma">
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
                  <EmptyState title="Acik talep yok" body="Aktif insa, talim veya arastirma oldugunda yardim penceresi buradan acilir." />
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
                          {request.requesterUserId === state.player.id ? "Senin talebin" : "Yardim gonder"}
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard kicker="Saha kayitlari" title="Son olaylar" aside={<Badge tone="info">{alliance.logs.length} kayit</Badge>}>
              <div className={styles.feedList}>
                {alliance.logs.length === 0 ? (
                  <EmptyState title="Log bos" body="Yeni yardim, bagis ve diplomasi hareketleri buraya dusecek." />
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
            <SectionCard kicker="Hazine" title="Ortak stok" aside={<Badge tone="success">Acik</Badge>}>
              <dl className={styles.definitionGrid}>
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
                  className={styles.textField}
                  type="number"
                  min={10}
                  max={5000}
                  value={donationAmount}
                  onChange={(event) => setDonationAmount(Number(event.target.value))}
                />
              </div>
              <p className={styles.mutedText}>
                Sehir stogu: {formatNumber(state.city.resources[donationResource])} {donationResource}
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
                {donateMutation.isPending ? "Isleniyor" : "Hazineye bagisla"}
              </Button>
            </SectionCard>

            <SectionCard kicker="Katki puani" title="Liderlik sirasi">
              <div className={styles.feedList}>
                {alliance.contributions.length === 0 ? (
                  <EmptyState title="Puan yok" body="Bagis ve yardim aksiyonlari katkilar tablosunu doldurur." />
                ) : (
                  alliance.contributions.slice(0, 6).map((entry, index) => (
                    <article key={entry.userId} className={styles.feedCard}>
                      <div className={styles.feedMeta}>
                        <strong>#{index + 1} {entry.username}</strong>
                        <span>{formatNumber(entry.points)} puan</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard kicker="Sancaklar" title="Harita isaretleri">
              <div className={styles.feedList}>
                {alliance.markers.length === 0 ? (
                  <EmptyState title="Isaret yok" body="Toplanma, savunma ve hedef noktalarini buradan sabitleyin." />
                ) : (
                  alliance.markers.slice(0, 6).map((marker) => (
                    <article key={marker.id} className={styles.feedCard}>
                      <div className={styles.feedMeta}>
                        <strong>{marker.label}</strong>
                        <span>{marker.x}, {marker.y}</span>
                      </div>
                      <p>{formatDateTime(marker.createdAt)}</p>
                    </article>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard
              kicker="Kadrolar"
              title="Uye listesi"
              aside={<Button type="button" variant="ghost" size="small" disabled={leaveAllianceMutation.isPending} onClick={() => leaveAllianceMutation.mutate()}>{leaveAllianceMutation.isPending ? "Cikiliyor" : "Ayril"}</Button>}
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
                            Officer yap
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
                            Uye yap
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
                            Liderligi devret
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
          <SectionCard kicker="Yeni sancak" title="Ittifak kur">
            <div className={styles.stack}>
              <input
                className={styles.textField}
                value={name}
                maxLength={32}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ittifak adi"
              />
              <input
                className={styles.textField}
                value={tag}
                maxLength={6}
                onChange={(event) => setTag(event.target.value.toUpperCase())}
                placeholder="Etiket"
              />
              <textarea
                className={styles.textArea}
                value={description}
                maxLength={180}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Kisa doktrin notu"
              />
              <Button
                type="button"
                disabled={createAllianceMutation.isPending || name.trim().length < 3 || tag.trim().length < 2}
                onClick={() => createAllianceMutation.mutate()}
              >
                {createAllianceMutation.isPending ? "Kuruluyor" : "Ittifaki kur"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard kicker="Acik sancaklar" title="Katil">
            <div className={styles.feedList}>
              {publicAlliances.length === 0 ? (
                <EmptyState title="Liste bos" body="Henuz gorunen bir ittifak yok." />
              ) : (
                publicAlliances.map((entry) => (
                  <article key={entry.id} className={styles.feedCard}>
                    <div className={styles.feedMeta}>
                      <strong>{entry.name}</strong>
                      <Badge tone="info">[{entry.tag}]</Badge>
                    </div>
                    <p>{entry.description || "Doktrin notu eklenmemis."}</p>
                    <div className={styles.actions}>
                      <span>{entry.memberCount} uye</span>
                      <Button
                        type="button"
                        size="small"
                        disabled={joinAllianceMutation.isPending || entry.joined}
                        onClick={() => joinAllianceMutation.mutate(entry.id)}
                      >
                        {entry.joined ? "Katilindi" : "Katil"}
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
