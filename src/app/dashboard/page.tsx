"use client";

import dynamic from "next/dynamic";

const GoodDaysDashboard = dynamic(
  () => import("@/components/GoodDaysDashboard"),
  { ssr: false }
);

export default function DashboardPage() {
  return <GoodDaysDashboard />;
}
