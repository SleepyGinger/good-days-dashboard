"use client";

import dynamic from "next/dynamic";

const GoodDaysDashboard = dynamic(
  () => import("@/components/GoodDaysDashboard"),
  { ssr: false, loading: () => <div className="dark bg-gray-900 min-h-screen" /> }
);

export default function Home() {
  return <GoodDaysDashboard />;
}
