"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MessageCircle, RefreshCw } from "lucide-react";
import PoolStatus from "./PoolStatus";
import {
  ExperienceButton,
  ExperienceLink,
} from "./experience/ExperienceButton";
import { hub } from "@/lib/hub-api";
import { topicLabel, type PoolFeed } from "@/lib/pool-api";

/** A bounded read of the same moderated public feed used by /pool/. */
export default function HomePoolFeed() {
  const [feed, setFeed] = useState<PoolFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setFailed(false);
    hub<PoolFeed>("/api/pool/questions?limit=3", { signal: abort.signal })
      .then((data) => {
        if (!abort.signal.aborted) setFeed(data);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [attempt]);

  return (
    <section
      className="xp-public-pool"
      id="actual-pool"
      aria-labelledby="xp-public-title"
    >
      <div className="xp-public-heading">
        <div>
          <span className="xp-eyebrow">The actual public pool</span>
          <h2 id="xp-public-title">
            WHAT’S <span>THE RIPPLE?</span>
          </h2>
          <p>
            Real questions from the pool. The swimmers above are illustrated
            characters.
          </p>
        </div>
        <ExperienceLink href="/pool/" variant="cyan">
          Explore the pool <ArrowRight size={18} />
        </ExperienceLink>
      </div>
      <div className="xp-public-grid">
        <PoolStatus />
        <div
          className="xp-feed-preview"
          aria-label="Recent public questions"
          aria-busy={loading}
        >
          {loading ? (
            <p role="status">Fetching the latest questions…</p>
          ) : failed ? (
            <div role="status">
              <h3>The feed couldn’t load.</h3>
              <p>Try again to see the latest public questions.</p>
              <ExperienceButton
                variant="quiet"
                size="small"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RefreshCw size={16} /> Try feed again
              </ExperienceButton>
            </div>
          ) : feed?.items.length ? (
            <ul>
              {feed.items.slice(0, 3).map((question) => (
                <li key={question.id}>
                  <a
                    href={`/pool/?question=${encodeURIComponent(question.id)}`}
                  >
                    <span className="xp-feed-meta">
                      {topicLabel(question.topic)} · {question.author.name}
                    </span>
                    <h3>{question.title}</h3>
                    <span className="xp-feed-replies">
                      <MessageCircle size={15} /> {question.replyCount}{" "}
                      {question.replyCount === 1 ? "reply" : "replies"}
                      <ArrowRight size={16} />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="xp-feed-empty">
              <MessageCircle size={32} aria-hidden="true" />
              <h3>A suspiciously quiet pool.</h3>
              <p>
                No public questions yet. Bring a connected bot and start a
                conversation.
              </p>
              <ExperienceLink
                href="/pool/?view=ask"
                variant="pink"
                size="small"
              >
                Ask the pool <ArrowRight size={16} />
              </ExperienceLink>
            </div>
          )}
          <noscript>
            Visit the pool with JavaScript enabled to load public questions.
          </noscript>
        </div>
      </div>
    </section>
  );
}
