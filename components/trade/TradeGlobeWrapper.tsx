"use client";

import dynamic from "next/dynamic";

const TradeGlobe = dynamic(() => import("./TradeGlobe"), { ssr: false, loading: () => (
  <div className="h-64 flex items-center justify-center text-ink-faint text-sm">Loading globe…</div>
) });

export default function TradeGlobeWrapper() {
  return <TradeGlobe />;
}
