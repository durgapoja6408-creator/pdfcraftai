"use client";

// ResumeParserTool — Tier 3 §3.6 P0.
//
// Parses a resume PDF into structured JSON via /api/ai/summarize
// depth=resume-parse, renders a clean preview + CSV export
// (one row per resume, columns flattening the key fields for
// easy pipeline into spreadsheets / ATS imports).
//
// Target users: recruiters / HR doing bulk triage. Free bulk
// upload would be compelling but ships later — v1 is single-file
// to validate the prompt quality before scaling the plumbing.

import { useState, useCallback, useEffect } from "react";
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
import { useToolTracking } from "./useToolTracking";

type Experience = {
  title: string;
  company: string;
  start: string | null;
  end: string | null;
  bullets: string[];
};

type Education = {
  degree: string;
  institution: string;
  year: string | null;
};

type Resume = {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  experience: Experience[];
  education: Education[];
  skills: string[];
  links: string[];
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

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function sArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function asResume(raw: unknown): Resume | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = s(r.name);
  if (!name) return null;
  const experience: Experience[] = Array.isArray(r.experience)
    ? r.experience
        .map((e): Experience | null => {
          if (!e || typeof e !== "object") return null;
          const er = e as Record<string, unknown>;
          const title = s(er.title);
          const company = s(er.company);
          if (!title || !company) return null;
          return {
            title,
            company,
            start: s(er.start),
            end: s(er.end),
            bullets: sArray(er.bullets),
          };
        })
        .filter((x): x is Experience => x !== null)
    : [];
  const education: Education[] = Array.isArray(r.education)
    ? r.education
        .map((e): Education | null => {
          if (!e || typeof e !== "object") return null;
          const er = e as Record<string, unknown>;
          const degree = s(er.degree);
          const institution = s(er.institution);
          if (!degree || !institution) return null;
          return { degree, institution, year: s(er.year) };
        })
        .filter((x): x is Education => x !== null)
    : [];
  return {
    name,
    email: s(r.email),
    phone: s(r.phone),
    location: s(r.location),
    summary: s(r.summary),
    experience,
    education,
    skills: sArray(r.skills),
    links: sArray(r.links),
  };
}

function escCsv(s: string): string {
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function resumeToCsv(r: Resume): string {
  const header = [
    "name",
    "email",
    "phone",
    "location",
    "summary",
    "experience_titles",
    "experience_companies",
    "education_degrees",
    "education_institutions",
    "skills",
    "links",
  ];
  const row = [
    r.name,
    r.email ?? "",
    r.phone ?? "",
    r.location ?? "",
    r.summary ?? "",
    r.experience.map((e) => e.title).join(" | "),
    r.experience.map((e) => e.company).join(" | "),
    r.education.map((e) => e.degree).join(" | "),
    r.education.map((e) => e.institution).join(" | "),
    r.skills.join(", "),
    r.links.join(" | "),
  ];
  return [header.join(","), row.map(escCsv).join(",")].join("\n") + "\n";
}

export function ResumeParserTool() {
  const trackTool = useToolTracking("ai-resume-parse", "AI");
  useEffect(() => trackTool.view(), [trackTool]);
  const router = useRouter();
  const { status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [meta, setMeta] = useState<{ creditCost: number; newBalance?: number } | null>(
    null
  );

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResume(null);
    setMeta(null);
    setFile(f);
    trackTool.upload(f);
  }, [trackTool]);

  const reset = () => {
    setFile(null);
    setError(null);
    setResume(null);
    setMeta(null);
  };

  const run = async () => {
    if (!file) return;
    const fresh = await getSession();
    if (!fresh?.user) {
      trackTool.signupRedirect("/tool/ai-resume-parse");

      router.push("/login?callbackUrl=/tool/ai-resume-parse");
      return;
    }
    setBusy(true);
    setError(null);
    setResume(null);
    setMeta(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("depth", "resume-parse");
      form.append("idempotencyKey", idempotencyKey);
      const res = await fetch("/api/ai/summarize", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const processingMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);

      if (res.ok || res.status === 207) {
        const markdown = String(body.markdown ?? "");
        const parsed = extractJsonObject(markdown);
        const r = parsed ? asResume(parsed) : null;
        if (!r) {
          setError(
            "Couldn't parse this as a resume. Make sure the PDF has a name and at least an experience or education section."
          );
          return;
        }
        setResume(r);
        setMeta({
          creditCost: Number(body.creditCost ?? 0),
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
        });
        trackTool.success({ creditCost: Number(body.creditCost ?? 0), depth: "resume-parse", processingMs });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError(
        "userMessage" in classified
          ? classified.userMessage
          : "Something went wrong. Try again in a moment."
      );
      trackTool.error({ errorCode: `http_${res.status}`, depth: "resume-parse" });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Request failed.");
      trackTool.error({ errorCode: "network_error", depth: "resume-parse" });
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = async () => {
    if (!resume) return;
    const bytes = new TextEncoder().encode(resumeToCsv(resume));
    const name = deriveOutputName(file?.name ?? "resume.pdf", "-parsed").replace(
      /\.pdf$/i,
      ".csv"
    );
    downloadBytes(bytes, name, "text/csv;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "ai-resume-parse",
        name,
        mime: "text/csv",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const downloadJson = async () => {
    if (!resume) return;
    const bytes = new TextEncoder().encode(JSON.stringify(resume, null, 2));
    const name = deriveOutputName(file?.name ?? "resume.pdf", "-parsed").replace(
      /\.pdf$/i,
      ".json"
    );
    downloadBytes(bytes, name, "application/json");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "ai-resume-parse",
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
          prompt="Drop a resume PDF to parse into structured data"
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
            <div title={file.name} style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {file.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>{humanSize(file.size)}</div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={reset} aria-label="Remove file">
            <I.X size={14} />
          </button>
        </div>
      )}

      <div
        className="card"
        style={{ padding: 14, fontSize: 13, lineHeight: 1.5, background: "var(--bg-2)" }}
      >
        Extracts name / email / phone / location / summary / experience (with
        bullets verbatim) / education / skills / links into structured JSON.
        CSV export flattens for ATS / spreadsheet import. 5 credits per resume.
      </div>

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {resume && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center" }}>
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Resume parsed</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {resume.experience.length} role{resume.experience.length === 1 ? "" : "s"} · {resume.education.length} degree{resume.education.length === 1 ? "" : "s"} · {resume.skills.length} skills
                {meta && ` · ${meta.creditCost} credits used`}
                {typeof meta?.newBalance === "number" && ` · ${meta.newBalance} left`}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={downloadJson}>
              <I.Download size={14} /><span>JSON</span>
            </button>
            <button type="button" className="btn btn-primary" onClick={downloadCsv}>
              <I.Download size={14} /><span>CSV</span>
            </button>
          </div>
          <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
            <div style={{ padding: 12, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{resume.name}</div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>
                {[resume.email, resume.phone, resume.location].filter(Boolean).join(" · ")}
              </div>
              {resume.summary && (
                <div style={{ marginTop: 8, fontSize: 12, fontStyle: "italic" }}>{resume.summary}</div>
              )}
            </div>

            {resume.experience.length > 0 && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>Experience ({resume.experience.length})</div>
                <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                  {resume.experience.map((e, i) => (
                    <li key={i} style={{ padding: 10, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                      <div style={{ fontWeight: 500 }}>{e.title} · <span className="subtle">{e.company}</span></div>
                      {(e.start || e.end) && (
                        <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                          {e.start ?? "?"} – {e.end ?? "present"}
                        </div>
                      )}
                      {e.bullets.length > 0 && (
                        <ul style={{ margin: "6px 0 0 0", paddingLeft: 18, fontSize: 12 }}>
                          {e.bullets.slice(0, 5).map((b, bi) => <li key={bi}>{b}</li>)}
                          {e.bullets.length > 5 && <li className="subtle">… {e.bullets.length - 5} more</li>}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {resume.education.length > 0 && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>Education ({resume.education.length})</div>
                <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
                  {resume.education.map((e, i) => (
                    <li key={i} style={{ padding: 8, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12 }}>
                      <strong>{e.degree}</strong> — {e.institution}{e.year && ` · ${e.year}`}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {resume.skills.length > 0 && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>Skills ({resume.skills.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {resume.skills.map((s, i) => (
                    <span key={i} style={{ padding: "2px 8px", background: "var(--bg-2)", borderRadius: 3, fontSize: 11 }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {resume.links.length > 0 && (
              <div className="subtle" style={{ fontSize: 12 }}>
                Links: {resume.links.join(" · ")}
              </div>
            )}
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
          <Link href="/login?callbackUrl=/tool/ai-resume-parse" className="btn btn-primary">
            Sign in to parse
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={run}
          >
            {busy ? "Parsing…" : "Parse resume"}
          </button>
        )}
      </div>
    </div>
  );
}
