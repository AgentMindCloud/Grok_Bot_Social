import type { BotActivitySnapshot } from "./types";
export const DEMO_LABEL = "DEMO MODE — fixture records, not a live workspace";
export function demoSnapshot(now = "2026-09-20T04:00:00.000Z"): BotActivitySnapshot {
  return {
    schemaVersion: 1, serverTime: now, ownerId: "demo-owner",
    coverage: { text: "Demo fixtures only. No live hub is connected.", monitoringSince: "2026-09-19T00:00:00.000Z", historyLimit: 100, nativeUnobservable: true },
    selectedBotIds: ["demo-scout", "demo-reviewer", "demo-quiet"],
    availableBotIds: ["demo-scout", "demo-reviewer", "demo-quiet"],
    truncatedAvailable: false, attentionCount: 2, cursor: null,
    stations: [
      { botId: "demo-scout", slot: 0, name: "Scout", role: "scout", runtime: "native-grok", adminState: "active", trustLabel: "owner-paired", lastCheckInAt: "2026-09-20T03:58:00.000Z", lastActivityAt: "2026-09-20T03:42:00.000Z", lastActivityKind: "result.received", lastActivitySource: "hub-recorded", lastActivityTitle: "Result received · not reviewed", assignment: { taskId: "demo-task-2", missionId: "demo-m-2", missionTitle: "Compare supplier delivery terms", attemptId: "demo-att-2", state: "leased", leasedAt: "2026-09-20T04:05:00.000Z", leaseExpiresAt: "2026-09-20T04:05:00.000Z" }, openTaskCount: 1, lastResult: { id: "demo-ev-1", kind: "result", title: "Price comparison received", statusLabel: "Result received · not reviewed", evidenceId: "demo-ev-1", approvalId: null, missionId: "demo-m-1", recordedAt: "2026-09-20T03:42:00.000Z", source: "hub-recorded", reviewed: false, shareApproved: false }, workObjects: [], attention: [], coverageWarning: null },
      { botId: "demo-reviewer", slot: 1, name: "Reviewer", role: "delegate", runtime: "native-grok", adminState: "active", trustLabel: "owner-paired", lastCheckInAt: "2026-09-20T03:10:00.000Z", lastActivityAt: "2026-09-20T03:12:00.000Z", lastActivityKind: "result.received", lastActivitySource: "hub-recorded", lastActivityTitle: "Result received · sharing review needed", assignment: null, openTaskCount: 0, lastResult: { id: "demo-ev-2", kind: "result", title: "Discrepancy note", statusLabel: "Result received · sharing review needed", evidenceId: "demo-ev-2", approvalId: "demo-ap-1", missionId: "demo-m-1", recordedAt: "2026-09-20T03:12:00.000Z", source: "hub-recorded", reviewed: false, shareApproved: false }, workObjects: [], attention: [{ id: "demo-ap-1", kind: "review", title: "Sharing approval needed: Discrepancy note", href: "/workspace/?view=sharing", evidenceId: "demo-ev-2", approvalId: "demo-ap-1", missionId: "demo-m-1" }], coverageWarning: null },
      { botId: "demo-quiet", slot: 2, name: "Archivist", role: "delegate", runtime: "grok-compatible", adminState: "paused", trustLabel: "owner-paired", lastCheckInAt: "2026-09-19T18:00:00.000Z", lastActivityAt: null, lastActivityKind: null, lastActivitySource: null, lastActivityTitle: null, assignment: null, openTaskCount: 0, lastResult: null, workObjects: [], attention: [{ id: "paused:demo-quiet", kind: "blocker", title: "Hub dispatch is paused for this bot", href: "/workspace/?view=bots", evidenceId: null, approvalId: null, missionId: null }], coverageWarning: "Current activity unknown. A check-in is not evidence of work." }
    ],
    recentEvents: [{ schemaVersion: 1, eventId: "demo-e1", ownerId: "demo-owner", botId: "demo-scout", missionId: "demo-m-1", taskId: null, attemptId: null, kind: "result.received", source: "hub-recorded", occurredAt: "2026-09-20T03:42:00.000Z", recordedAt: "2026-09-20T03:42:00.000Z", title: "Saved private evidence: Price comparison received", evidenceId: "demo-ev-1", approvalId: null }]
  };
}
export const DEMO_REPLAY = [
  { title: "Scout collected an assignment", detail: "Hub recorded assignment lease. This is not observed execution.", at: "2026-09-20T03:20:00.000Z", source: "hub-recorded" as const },
  { title: "Scout submitted a result", detail: "Hub accepted a research result. Not reviewed.", at: "2026-09-20T03:42:00.000Z", source: "hub-recorded" as const },
  { title: "A sharing decision awaited the owner", detail: "Owner action is still required in the workspace.", at: "2026-09-20T03:12:30.000Z", source: "hub-recorded" as const }
];
