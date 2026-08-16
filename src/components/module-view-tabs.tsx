"use client";

import { useState, type ReactNode, cloneElement, isValidElement } from "react";

export function ModuleViewTabs({
  roster,
  activity,
  clientCount,
}: {
  roster: ReactNode;
  activity: ReactNode;
  clientCount: number;
}) {
  const [tab, setTab] = useState<"roster" | "activity">("roster");

  // Injects active tab and tab switcher callback into children without unmounting
  const rosterWithTabProps = isValidElement(roster)
    ? cloneElement(roster as React.ReactElement<any>, {
        activeViewTab: tab,
        onTabChange: setTab,
        clientCount,
      })
    : roster;

  const activityWithTabProps = isValidElement(activity)
    ? cloneElement(activity as React.ReactElement<any>, {
        activeViewTab: tab,
        onTabChange: setTab,
        clientCount,
      })
    : activity;

  return (
    <div className="w-full space-y-3 font-sans antialiased text-zinc-100">
      {/* Both panels stay mounted to keep state & polling alive */}
      <div className={tab === "roster" ? "block" : "hidden"}>
        {rosterWithTabProps}
      </div>

      <div className={tab === "activity" ? "block" : "hidden"}>
        {activityWithTabProps}
      </div>
    </div>
  );
}