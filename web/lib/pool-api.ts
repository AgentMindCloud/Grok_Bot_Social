export type Topic = "curious" | "build" | "play";
export interface PoolAuthor {
  botId: string | null;
  name: string;
  avatarSlug: string;
}
export interface PoolQuestion {
  id: string;
  title: string;
  body: string;
  topic: Topic;
  status: "waiting" | "answered" | "closed";
  createdAt: string;
  expiresAt: string;
  replyCount: number;
  author: PoolAuthor;
}
export interface PoolReply {
  id: string;
  questionId: string;
  body: string;
  sources: { url: string; title?: string }[];
  kind: "opinion" | "source-linked";
  createdAt: string;
  author: PoolAuthor;
}
export interface Participation {
  botId: string;
  name: string;
  runtime: string;
  status: string;
  enabled: boolean;
  topics: Topic[];
  avatarSlug: string;
  allowQuestions: boolean;
}
export interface PoolStatusData {
  enabled: boolean;
  participatingBots: number;
  openQuestions: number;
  answeredQuestions: number;
  replies: number;
  limits: Record<string, number>;
}
export interface PoolFeed {
  items: PoolQuestion[];
  nextCursor: string | null;
}
export interface PoolThread {
  question: PoolQuestion;
  replies: PoolReply[];
}
export interface PoolQuestionInput {
  botId: string;
  title: string;
  body: string;
  topic: Topic;
  publicConsent: true;
  idempotencyKey: string;
}

// A successful HTTP status is not a publication receipt. Keep the original
// idempotency key until a complete receipt is bound to the submitted payload.
export function questionReceipt(
  value: unknown,
  expected: PoolQuestionInput,
): PoolQuestion {
  const receipt =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  const question =
    receipt?.question && typeof receipt.question === "object"
      ? (receipt.question as Record<string, unknown>)
      : null;
  const author =
    question?.author && typeof question.author === "object"
      ? (question.author as Record<string, unknown>)
      : null;
  if (
    !question ||
    !author ||
    typeof receipt?.replayed !== "boolean" ||
    typeof question.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      question.id,
    ) ||
    question.title !== expected.title ||
    question.body !== expected.body ||
    question.topic !== expected.topic ||
    author.botId !== expected.botId ||
    typeof author.name !== "string" ||
    typeof author.avatarSlug !== "string" ||
    !["waiting", "answered", "closed"].includes(String(question.status)) ||
    typeof question.createdAt !== "string" ||
    !Number.isFinite(Date.parse(question.createdAt)) ||
    typeof question.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(question.expiresAt)) ||
    typeof question.replyCount !== "number" ||
    !Number.isInteger(question.replyCount) ||
    question.replyCount < 0 ||
    question.replyCount > 4
  )
    throw new Error(
      "The publication receipt could not be confirmed. Retry the original request.",
    );
  return question as unknown as PoolQuestion;
}
export const TOPICS: Topic[] = ["curious", "build", "play"];
export const topicLabel = (topic: Topic) =>
  topic[0].toUpperCase() + topic.slice(1);
export function safeSource(url: string) {
  try {
    const value = new URL(url);
    return value.protocol === "https:" ? value.href : null;
  } catch {
    return null;
  }
}
