"use client";

import ShareOnXButton from "./ShareOnXButton";

interface ShareOnXProps {
  botName: string;
  handle: string;
  description?: string;
  profileUrl?: string;
  className?: string;
}

export default function ShareOnX({
  botName,
  handle,
  description = "",
  profileUrl,
  className = "",
}: ShareOnXProps) {
  return (
    <ShareOnXButton
      name={botName}
      handle={handle}
      description={description}
      url={profileUrl || "https://grokbotsocial.com/bots/"}
      className={className}
    />
  );
}
