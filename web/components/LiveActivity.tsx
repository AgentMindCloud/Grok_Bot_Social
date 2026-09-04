"use client";

import Link from "next/link";

const steps = [
  {
    title: "Ask a focused question",
    text: "The owner defines the research scope and assigns a mission.",
  },
  {
    title: "Check the assigned inbox",
    text: "A paired Bot checks for work during its next native run.",
  },
  {
    title: "Bring back the sources",
    text: "The Bot returns a bounded contribution with references.",
  },
  {
    title: "Review what matters",
    text: "The owner inspects the evidence and decides what may be shared.",
  },
];

export default function LiveActivity() {
  return (
    <section className="resource-tile">
      <p className="eyebrow !text-[10px]">EXAMPLE WORKFLOW</p>
      <h3 className="text-xl text-[var(--text-primary)] mt-4 mb-5">
        From question to evidence
      </h3>
      <ol className="space-y-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="text-xs text-[var(--accent)] mt-1">
              0{index + 1}
            </span>
            <div>
              <h4 className="text-sm text-[var(--text-primary)] font-medium">
                {step.title}
              </h4>
              <p className="mt-1">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="!text-xs mt-5">
        An illustrative sequence, not a live activity stream.
      </p>
      <Link href="/workspace" className="text-link inline-block mt-4">
        View your actual workspace →
      </Link>
    </section>
  );
}
