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
  kind?: "research" | "weekly-decision";
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
  privateBetaEnabled?: boolean;
  weeklyResearchEnabled?: boolean;
  accessDenied?: boolean;
  authenticated: boolean;
  owner?: Owner;
  csrfToken?: string;
  localLoginEnabled: boolean;
  githubLoginEnabled: boolean;
}
export interface Task {
  weeklyContext?: WeeklyContext;
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

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export type ReviewDecision = "test" | "watch" | "stop";
export type Usefulness =
  "useful" | "partly_useful" | "not_useful" | "not_assessed";
export type Assistance = "assisted" | "unassisted" | "unknown";
export interface WeeklyMissionInput {
  offer: string;
  buyer: string;
  products: { name: string; url: string }[];
  seedUrls: string[];
  approvedOrigins: string[];
  priorReviewId?: string;
  priorReviewVersion?: number;
}
export interface WeeklyContext {
  schemaVersion: 1;
  offer: string;
  buyer: string;
  products: { name: string; url: string }[];
  seedUrls: string[];
  approvedOrigins: string[];
  priorReview: null | {
    id: string;
    version: number;
    decision: ReviewDecision;
    usefulness: Usefulness;
    rationale: string;
    nextReviewAt: string | null;
    createdAt: string;
    availableEvidenceCount: number;
    unavailableEvidenceCount: number;
  };
}
export interface WeeklyMissionRequest {
  kind: "weekly-decision";
  title: string;
  botIds: string[];
  maxRounds?: number;
  visibility: "private";
  weeklyInput: WeeklyMissionInput;
  idempotencyKey: string;
}
export interface ReviewInput {
  expectedVersion: number;
  decision: ReviewDecision;
  usefulness: Usefulness;
  rationale: string;
  evidenceIds: string[];
  nextReviewAt?: string | null;
  assistance: Assistance;
  reviewDurationSeconds?: number | null;
  idempotencyKey: string;
}
export type ReviewCitation =
  | { available: true; evidence: Evidence; contentHash: string }
  | { available: false };
export interface OwnerReview {
  id: string;
  missionId: string;
  version: number;
  decision: ReviewDecision;
  usefulness: Usefulness;
  rationale: string;
  nextReviewAt: string | null;
  assistance: Assistance;
  reviewDurationSeconds: number | null;
  measurement: ActivityMeasurement | null;
  createdAt: string;
  citations: ReviewCitation[];
}
export interface ActivityMeasurement {
  cohortKey: string;
  classification: "internal" | "test" | "invited";
  consent: boolean;
  assistance: Assistance;
}
export interface PilotEnrollment {
  cohortKey: string;
  classification: "internal" | "test" | "invited";
  consent: boolean;
  consentVersion: number;
  assistance: Assistance;
  enrolledAt: string;
  updatedAt: string;
}
export interface WorkspaceSummary {
  owner: Owner;
  bots: Bot[];
  circles: Circle[];
  privateBetaEnabled: boolean;
  weeklyResearchEnabled: boolean;
  pilotEnrollment: PilotEnrollment | null;
  counts: {
    missions: number;
    activeMissions: number;
    evidence: number;
    pendingApprovals: number;
    reviewedMissions: number;
  };
}
export interface TaskProgress {
  scope: "whole-mission" | "own-assignments";
  total: number;
  queued: number;
  leased: number;
  completed: number;
  failed: number;
}
export interface MissionDetail {
  mission: Mission;
  tasks: {
    id: string;
    botId: string;
    round: number;
    status: "queued" | "leased" | "completed" | "failed";
    attempts: number;
    leaseExpiresAt: string | null;
  }[];
  evidence: Evidence[];
  progress: TaskProgress;
  deadlineAt: string;
  serverTime: string;
  weeklyInput: WeeklyContext | null;
  latestReview: OwnerReview | null;
  followups: { missionId: string; reviewId: string; createdAt: string }[];
  parentMissionId: string | null;
}
