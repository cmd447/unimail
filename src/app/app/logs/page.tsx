"use client";

import { useFetch } from "@/components/web/api";
import { Btn, PageHead } from "@/components/web/ui";
import { LogFeed } from "@/components/web/logfeed";

export default function Logs() {
  const { data, reload, loading } = useFetch<{ events: any[] }>(
    "/api/events?limit=500",
  );

  return (
    <div>
      <PageHead title="Logs">
        <Btn onClick={reload}>{loading ? "…" : "refresh"}</Btn>
      </PageHead>
      <LogFeed events={data?.events ?? []} />
    </div>
  );
}
