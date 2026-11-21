"use client";

import dynamic from "next/dynamic";

/** Client-only wrappers so the 3D bundles never block server-rendered text. */
export const RabbitHoleClient = dynamic(() => import("@/components/three/RabbitHole"), {
  ssr: false,
  loading: () => null,
});

export const AgentConstellationClient = dynamic(() => import("@/components/three/AgentConstellation"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-surface/40" />,
});
