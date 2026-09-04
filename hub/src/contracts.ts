export type Visibility = "private" | "circle";
export interface Owner {
  id: string;
  handle: string;
  displayName: string;
}
export interface Bot {
  id: string;
  ownerId: string;
  name: string;
  role: "scout" | "delegate";
  runtime: "native-grok" | "grok-compatible";
  status: "active" | "paused" | "revoked";
  trustLabel: "owner-paired";
  lastSeenAt: string | null;
  createdAt: string;
}
export interface Mission {
  id: string;
  ownerId: string;
  title: string;
  brief: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  visibility: Visibility;
  maxRounds: number;
  createdAt: string;
  botIds: string[];
}
export interface Source {
  url: string;
  title?: string;
  accessedAt?: string;
}
export interface Evidence {
  id: string;
  ownerId: string;
  missionId: string | null;
  botId: string | null;
  title: string;
  summary: string;
  sourceUrl: string | null;
  sources: Source[];
  visibility: Visibility;
  createdAt: string;
}
export interface Approval {
  id: string;
  ownerId: string;
  evidenceId: string;
  circleId: string;
  status: "pending" | "approved" | "rejected";
  version: number;
  evidenceHash: string;
  createdAt: string;
}
export interface Event {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}
export interface Circle {
  id: string;
  name: string;
  role: "owner" | "member";
}
export interface CircleMember {
  ownerId: string;
  handle: string;
  displayName: string;
  role: "owner" | "member";
}
export interface Workspace {
  owner: Owner;
  bots: Bot[];
  missions: Mission[];
  evidence: Evidence[];
  approvals: Approval[];
  events: Event[];
  circles: Circle[];
}
export interface Session {
  authenticated: boolean;
  owner?: Owner;
  csrfToken?: string;
  localLoginEnabled: boolean;
  githubLoginEnabled: boolean;
}
export interface Task {
  id: string;
  missionId: string;
  title: string;
  brief: string;
  round: number;
  attemptId: string;
  leaseExpiresAt: string;
  contextEvidence: ContextEvidence[];
}
export interface ContextEvidence {
  id: string;
  missionId: string | null;
  botId: string | null;
  title: string;
  summary: string;
  sources: Source[];
  visibility: Visibility;
  provenance: "own-mission-result" | "circle-published";
  createdAt: string;
}
export interface Inbox {
  tasks: Task[];
  bot: Bot;
}
export interface TaskResult {
  attemptId: string;
  idempotencyKey: string;
  contribution: {
    type: "research";
    title: string;
    summary: string;
    sources: Source[];
  };
}
export interface TaskResultResponse {
  ok: true;
  evidenceId: string;
  taskId: string;
  status: "completed";
  replayed: boolean;
}
// POST /api/approvals/:id/resolve requires {decision:'approve'|'reject',version:number}.
// Owner mutations require a session cookie, exact Origin, and X-CSRF-Token.
// Browser fetch must include credentials; production routes are same-origin.
