"use client";

import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { Layers } from "lucide-react";

interface SkillOrbitalRingProps {
  enabledSkills?: SkillName[];
  size?: number;
  className?: string;
  interactive?: boolean;
}

export function SkillOrbitalRing({
  enabledSkills,
  size = 220,
  className = "",
}: SkillOrbitalRingProps) {
  const radius = size * 0.36; // Orbit radius
  const badgeSize = Math.round(size * 0.17); // Badge size

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer Dashed Orbit Track */}
      <div
        className="absolute rounded-full border border-dashed border-zinc-300 dark:border-zinc-700/80 animate-[spin_60s_linear_infinite]"
        style={{
          width: radius * 2 + badgeSize,
          height: radius * 2 + badgeSize,
        }}
      />

      {/* Inner Glowing Radar Ring */}
      <div
        className="absolute rounded-full border border-teal-500/20 dark:border-teal-400/20 bg-teal-500/5 dark:bg-teal-400/5"
        style={{
          width: radius * 2,
          height: radius * 2,
        }}
      />

      {/* Center Core Hub */}
      <div className="z-10 flex flex-col items-center justify-center w-12 h-12 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-md">
        <Layers className="w-5 h-5 text-teal-600 dark:text-teal-400" />
      </div>

      {/* 5 Orbiting Squishy Skill Badges */}
      {SKILLS.map((skill, index) => {
        // Compute 5-point circle angles (0°, 72°, 144°, 216°, 288° offset to top -90°)
        const angleRad = (index * 72 - 90) * (Math.PI / 180);
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;

        const isEnabled = enabledSkills ? enabledSkills.includes(skill) : true;
        const info = SKILL_INFO[skill];

        return (
          <div
            key={skill}
            className="absolute z-20 transition-all duration-300 hover:scale-125 hover:z-30 cursor-pointer"
            style={{
              transform: `translate(${x}px, ${y}px)`,
            }}
            title={`${info.name}: ${isEnabled ? "Enabled" : "Disabled"}`}
          >
            <SquishySkillBadge skill={skill} size={badgeSize} enabled={isEnabled} />
          </div>
        );
      })}
    </div>
  );
}