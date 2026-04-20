"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ALL_HELP_ARTICLES } from "@/lib/help-topics";

type Match = {
  topicName: string;
  articleTitle: string;
  articleSummary: string;
  href: string;
};

export function HelpSearch() {
  const [q, setQ] = useState("");

  const matches: Match[] = useMemo(() => {
    if (!q.trim()) return [];
    const qq = q.toLowerCase();
    const out: Match[] = [];
    for (const { topic, article } of ALL_HELP_ARTICLES) {
      const haystack = (
        article.title +
        " " +
        article.summary +
        " " +
        article.body.join(" ") +
        " " +
        topic.name
      ).toLowerCase();
      if (haystack.includes(qq)) {
        out.push({
          topicName: topic.name,
          articleTitle: article.title,
          articleSummary: article.summary,
          href: `/help/${article.slug}`,
        });
        if (out.length >= 6) return out;
      }
    }
    return out;
  }, [q]);

  return (
    <div style={{ position: "relative", maxWidth: 640, margin: "0 auto" }}>
      <div
        className="row"
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "0 16px",
          gap: 10,
        }}
      >
        <I.Search size={18} />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles, topics, or errors…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            padding: "16px 0",
            color: "var(--fg)",
            outline: "none",
            fontSize: 15,
          }}
        />
      </div>

      {matches.length > 0 && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            padding: 8,
            zIndex: 20,
            background: "var(--bg-1)",
            textAlign: "left",
          }}
        >
          {matches.map((m, i) => (
            <Link
              key={`${m.topicName}-${m.articleTitle}-${i}`}
              href={m.href}
              className="row"
              style={{
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 8,
                textDecoration: "none",
                color: "inherit",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{m.articleTitle}</div>
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.topicName} · {m.articleSummary}
                </div>
              </div>
              <I.ArrowRight size={14} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
