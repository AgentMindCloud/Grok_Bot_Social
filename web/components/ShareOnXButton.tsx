"use client";

interface ShareOnXButtonProps {
  name: string;
  handle: string;
  url: string;
  description?: string;
  className?: string;
}

export default function ShareOnXButton({
  name,
  url,
  description = "",
  className = "",
}: ShareOnXButtonProps) {
  const text =
    name +
    " is an example character from the Bottocks collection." +
    (description
      ? "\n\n" +
        description.slice(0, 120) +
        (description.length > 120 ? "…" : "")
      : "") +
    "\n\nExplore the character concept:";
  const shareUrl =
    "https://x.com/intent/tweet?text=" +
    encodeURIComponent(text) +
    "&url=" +
    encodeURIComponent(url);
  return (
    <a
      href={shareUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={"button button-dark " + className}
    >
      Share example on X ↗
    </a>
  );
}
