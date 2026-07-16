"use client";

import { useEffect, useState, useRef } from "react";

interface DatasetStatsProps {
  total: number;
  success: number;
  failed: number;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    if (diff === 0) return;

    const duration = 800;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Apple spring easing
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
      else prevRef.current = value;
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <>{display}</>;
}

export function DatasetStats({ total, success, failed }: DatasetStatsProps) {
  const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

  const stats = [
    {
      label: "总条目",
      value: <AnimatedNumber value={total} />,
      color: "var(--accent)",
      bg: "var(--accent-soft)",
    },
    {
      label: "成功",
      value: <AnimatedNumber value={success} />,
      color: "var(--success)",
      bg: "var(--success-soft)",
    },
    {
      label: "失败",
      value: <AnimatedNumber value={failed} />,
      color: "var(--error)",
      bg: "var(--error-soft)",
    },
    {
      label: "成功率",
      value: (
        <>
          <AnimatedNumber value={successRate} />%
        </>
      ),
      color: "var(--warning)",
      bg: "var(--warning-soft)",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={`animate-fade-in-up delay-${(i + 1) * 100}`}
        >
          <div className="apple-card apple-card-hover p-5 h-full">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: stat.color }}
              />
              <span
                className="text-[13px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {stat.label}
              </span>
            </div>
            <p
              className="text-display text-[32px] md:text-[36px]"
              style={{ color: stat.color }}
            >
              {stat.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
