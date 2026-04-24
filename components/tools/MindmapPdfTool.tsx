"use client";

// MindmapPdfTool — Tier 2 §2.4 P1.
//
// Sends PDF → /api/ai/summarize with depth=mindmap → expects a
// JSON tree inside a ```json fence. Renders the tree as a
// collapsible nested outline + text-outline export + JSON export.
//
// Not an SVG mind map with curved branches — that would need a
// graph-layout library. Collapsible outline is the minimum viable
// "mind map" that conveys structure without adding a visualisation
// dependency. A future v2 could pipe the same JSON through a
// Mermaid / Markmap renderer for the classic radial look.

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";

type TreeNode = {
  label: string;
  children: TreeNode[];
};

type MindMap = {
  root: string;
  branches: TreeNode[];
};

function extractJsonObject(markdown: string): unknown | null {
  const fence = markdown.match(/```json\s*([\s\S]*?)\s*```/);
  const raw = fence ? fence[1] : null;
  let text = raw;
  if (!text) {
    const first = markdown.indexOf("{");
    const last = markdown.lastIndexOf("}");
    if (first !== -1 && last > first) text = markdown.slice(first, last + 1);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asNode(raw: unknown): TreeNode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.label !== "string") return null;
  const children: TreeNode[] = [];
  if (Array.isArray(r.children)) {
    for (const c of r.children) {
      const node = asNode(c);
      if (node) children.push(node);
    }
  }
  return { label: r.label, children };
}

function asMindMap(raw: unknown): MindMap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.root !== "string") return null;
  const branches: TreeNode[] = [];
  if (Array.isArray(r.branches)) {
    for (const b of r.branches) {
      const node = asNode(b);
      if (node) branches.push(node);
    }
  }
  if (branches.length === 0) return null;
  return { root: r.root, branches };
}

function treeToText(mm: MindMap): string {
  // Renders to a plain-text outline suitable for paste into
  // docs, notebooks, or other mind-map apps that accept OPML-
  // adjacent outline imports.
  const lines: string[] = [];
  lines.push(mm.root);
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      lines.push(`${"  ".repeat(depth)}• ${n.label}`);
      if (n.children.length > 0) walk(n.children, depth + 1);
    }
  };
  walk(mm.branches, 1);
  return lines.join("\n") + "\n";
}

function TreeList({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        paddingLeft: depth === 0 ? 0 : 18,
      }}
    >
      {nodes.map((n, i) => {
        const hasChildren = n.children.length > 0;
        return (
          <li key={i} style={{ padding: "3px 0" }}>
            {hasChildren ? (
              <details open={depth < 1} style={{ display: "block" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: depth === 0 ? 500 : 400,
                    fontSize: depth === 0 ? 14 : 13,
                    color: depth === 0 ? "var(--fg)" : "var(--fg-subtle)",
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  {n.label}
                </summary>
                <TreeList nodes={n.children} depth={depth + 1} />
              </details>
            ) : (
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 6px",
                  fontSize: depth === 0 ? 14 : 13,
                  color: "var(--fg-subtle)",
                }}
              >
                {/* Bullet for leaves to distinguish from collapsible nodes. */}
                <span style={{ color: "var(--border-strong)", marginRight: 6 }}>▸</span>
                {n.label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MindmapPdfTool() {
  const router = useRouter();
  const { status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mindmap, setMindmap] = useState<MindMap | null>(null);
  const [meta, setMeta] = useState<{ creditCost: number; newBalance?: number } | null>(null);

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setMindmap(null);
    setMeta(null);
    setFile(f);
  }, []);

  const reset = () => {
    setFile(null);
    setError(null);
    setMindmap(null);
    setMeta(null);
  };

  const run = async () => {
    if (!file) return;
    const fresh = await getSession();
    if (!fresh?.user) {
      router.push("/login?callbackUrl=/tool/ai-mindmap");
      return;
    }
    setBusy(true);
    setError(null);
    setMindmap(null);
    setMeta(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("depth", "mindmap");
      form.append("idempotencyKey", idempotencyKey);
      const res = await fetch("/api/ai/summarize", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.ok || res.status === 207) {
        const markdown = String(body.markdown ?? "");
        const parsed = extractJsonObject(markdown);
        const mm = parsed ? asMindMap(parsed) : null;
        if (!mm) {
          setError(
            "The AI returned output in an unexpected format. This usually resolves on retry."
          );
          return;
        }
        setMindmap(mm);
        setMeta({
          creditCost: Number(body.creditCost ?? 0),
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
        });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError(
        "userMessage" in classified
          ? classified.userMessage
          : "Something went wrong. Try again in a moment."
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const downloadText = async () => {
    if (!mindmap) return;
    const bytes = new TextEncoder().encode(treeToText(mindmap));
    const name = deriveOutputName(file?.name ?? "mindmap.pdf", "-mindmap").replace(
      /\.pdf$/i,
      ".txt"
    );
    downloadBytes(bytes, name, "text/plain;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "ai-mindmap",
        name,
        mime: "text/plain",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const downloadJson = async () => {
    if (!mindmap) return;
    const bytes = new TextEncoder().encode(JSON.stringify(mindmap, null, 2));
    const name = deriveOutputName(file?.name ?? "mindmap.pdf", "-mindmap").replace(
      /\.pdf$/i,
      ".json"
    );
    downloadBytes(bytes, name, "application/json");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "ai-mindmap",
        name,
        mime: "application/json",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const signedOut = status !== "loading" && status !== "authenticated";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to build a mind map from its structure"
        />
      ) : (
        <div
          className="card"
          style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.File size={18} />
          </span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              title={file.name}
              style={{
                fontSize: 14,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {file.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>{humanSize(file.size)}</div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={busy}
            onClick={reset}
            aria-label="Remove file"
          >
            <I.X size={14} />
          </button>
        </div>
      )}

      <div
        className="card"
        style={{ padding: 14, fontSize: 13, lineHeight: 1.5, background: "var(--bg-2)" }}
      >
        4–8 top-level branches, up to 3 levels deep. Short labels (2–8 words).
        Renders as a collapsible outline — export as text outline or JSON tree.
        10 credits per PDF.
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>
      )}

      {mindmap && (
        <div
          className="card"
          style={{
            padding: 20,
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Mind map ready</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {mindmap.branches.length} top-level branches ·{" "}
                {meta?.creditCost} credits used
                {typeof meta?.newBalance === "number" && ` · ${meta.newBalance} left`}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={downloadText}>
              <I.Download size={14} />
              <span>Text outline</span>
            </button>
            <button type="button" className="btn btn-primary" onClick={downloadJson}>
              <I.Download size={14} />
              <span>JSON tree</span>
            </button>
          </div>
          <div
            style={{
              padding: 20,
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                padding: "6px 12px",
                background: "var(--accent-soft)",
                borderRadius: 6,
                display: "inline-block",
                marginBottom: 12,
              }}
            >
              {mindmap.root}
            </div>
            <TreeList nodes={mindmap.branches} />
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        {signedOut ? (
          <Link
            href="/login?callbackUrl=/tool/ai-mindmap"
            className="btn btn-primary"
          >
            Sign in to run
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={run}
          >
            {busy ? "Building map…" : "Build mind map"}
          </button>
        )}
      </div>
    </div>
  );
}
