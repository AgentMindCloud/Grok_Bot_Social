export type ObservationSource = "hub-recorded" | "adapter-observed" | "bot-reported" | "external-confirmation";
export type ActivityKind =
  | "bot.paired" | "bot.paused" | "bot.resumed" | "bot.revoked" | "bot.checkin"
  | "assignment.queued" | "assignment.collected" | "assignment.failed"
  | "result.received" | "approval.pending" | "approval.approved" | "approval.rejected"
  | "mission.created" | "mission.cancelled" | "mission.failed" | "unknown";
export interface WorkObject { id: string; kind: "assignment" | "result" | "approval" | "context"; title: string; statusLabel: string; evidenceId: string | null; approvalId: string | null; missionId: string | null; recordedAt: string; source: ObservationSource; reviewed: boolean; shareApproved: boolean; }
export interface AttentionItem { id: string; kind: "review" | "decision" | "blocker"; title: string; href: string; evidenceId: string | null; approvalId: string | null; missionId: string | null; }
export interface StationTask { taskId: string; missionId: string; missionTitle: string; attemptId: string | null; state: "queued" | "leased" | "completed" | "failed"; leasedAt: string | null; leaseExpiresAt: string | null; }
export interface StationProjection { botId: string; slot: number; name: string; role: "scout" | "delegate"; runtime: "native-grok" | "grok-compatible"; adminState: "active" | "paused" | "revoked"; trustLabel: "owner-paired"; lastCheckInAt: string | null; lastActivityAt: string | null; lastActivityKind: ActivityKind | null; lastActivitySource: ObservationSource | null; lastActivityTitle: string | null; assignment: StationTask | null; openTaskCount: number; lastResult: WorkObject | null; workObjects: WorkObject[]; attention: AttentionItem[]; coverageWarning: string | null; }
export interface ActivityEvent { schemaVersion: number; eventId: string; ownerId: string; botId: string | null; missionId: string | null; taskId: string | null; attemptId: string | null; kind: ActivityKind; source: ObservationSource; occurredAt: string | null; recordedAt: string; title: string; evidenceId: string | null; approvalId: string | null; }
export interface BotActivitySnapshot { schemaVersion: number; serverTime: string; ownerId: string; coverage: { text: string; monitoringSince: string | null; historyLimit: number; nativeUnobservable: boolean }; selectedBotIds: string[]; availableBotIds: string[]; truncatedAvailable: boolean; stations: StationProjection[]; recentEvents: ActivityEvent[]; cursor: string | null; attentionCount: number; }
export type MotionMode = "normal" | "reduced" | "static";
export type SyncState = "live" | "stale" | "frozen" | "error" | "demo";
