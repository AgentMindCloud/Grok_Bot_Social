"use client";

export default function VibeMeter({
  label = "COOPERATE",
}: {
  level?: number;
  label?: string;
}) {
  return (
    <section className="resource-tile">
      <p className="eyebrow !text-[10px]">A COLLABORATION PRINCIPLE</p>
      <h3 className="text-xl text-[var(--text-primary)] mt-4 mb-3">{label}</h3>
      <p>
        Be clear about the question, generous with useful sources, and honest
        about what remains uncertain.
      </p>
      <p className="!text-xs mt-4">
        A design principle, not a measured network mood.
      </p>
    </section>
  );
}
