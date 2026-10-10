"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchField } from "@phantom/ui";

export function ResourceSearch({ path, parameter, initialValue, placeholder, submit }: {
  path: string; parameter: string; initialValue: string; placeholder: string; submit: string;
}) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();
  return <div className="twitch-resource-search">
    <SearchField size="compact" value={value} onValueChange={setValue} onSubmit={input => {
      const query = new URLSearchParams({ [parameter]: input.trim().slice(0, 210) });
      router.push(`${path}?${query}`);
    }} labels={{ placeholder, submit, working: "Opening…", suggestions: "Suggestions", looking: "Looking…", clear: "Clear" }} />
  </div>;
}
