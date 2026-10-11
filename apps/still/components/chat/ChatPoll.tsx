"use client";

import { useId, useState } from "react";
import { CaretDown } from "@phosphor-icons/react/ssr";
import { pollShares, type ChatPoll as Poll } from "@/lib/chat/polls";
import { formatTime } from "@/lib/format";

const count = new Intl.NumberFormat("en");

/** Read-only: voting needs a Twitch account, which Still never asks for. */
export function ChatPoll({ poll, at }: {
  poll: Poll | null;
  /** The moment being shown, on Twitch's clock: now for live chat, the playhead for a replay. */
  at: number;
}) {
  const choicesId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const ended = poll?.status === "ended";
  const shares = poll ? pollShares(poll) : [];
  const most = poll ? Math.max(...poll.choices.map(choice => choice.votes)) : 0;
  return <>
    <span className="sr-only" role="status">{poll ? `${ended ? "Poll ended" : "Poll"}: ${poll.title}` : ""}</span>
    {poll && <section className="still-chat-poll" aria-label="Poll" data-ended={ended || undefined}>
      <button type="button" className="still-chat-poll-heading" aria-expanded={!collapsed} aria-controls={choicesId} onClick={() => setCollapsed(value => !value)}>
        <span className="still-chat-poll-title">{poll.title}</span>
        <span className="still-chat-poll-state">{ended ? "Ended" : `${formatTime(Math.ceil((poll.endsAt - at) / 1000))} left`}</span>
        <CaretDown size={14} />
      </button>
      {!collapsed && <div id={choicesId}>
        <ol className="still-chat-poll-choices">
          {poll.choices.map((choice, index) => <li key={choice.id} data-winner={(ended && most > 0 && choice.votes === most) || undefined}>
            <span>{choice.title}</span>
            <strong>{shares[index]}%</strong>
            <span className="still-chat-poll-bar" aria-hidden="true"><span style={{ width: `${shares[index]}%` }} /></span>
          </li>)}
        </ol>
        <p className="still-chat-poll-total">{count.format(poll.votes)} {poll.votes === 1 ? "vote" : "votes"}</p>
      </div>}
    </section>}
  </>;
}
