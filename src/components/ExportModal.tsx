import { useEffect, useState } from "react";
import { copyText, fmtBytes, type ReleaseBuild } from "../lib/zipExport";

interface Props {
  open: boolean;
  onClose: () => void;
  building: boolean;
  error: string | null;
  onRetry: () => void;
  release: ReleaseBuild | null;
  onSaveHtml: () => void;
  onCopyHtml: () => void;
  onSaveZip: () => void;
  savedKind: "html" | "zip" | "copy" | null;
  zipBusy: boolean;
  onToast: (kind: "ok" | "err" | "info", text: string) => void;
}

const STEPS = [
  { n: "01", title: "Download the file", desc: "Save KoeDoku.html via the save dialog" },
  { n: "02", title: "Double-click to launch", desc: "A single file with JS/CSS embedded — no extraction or installation needed" },
  { n: "03", title: "Done", desc: "No internet connection required. Subtitle sync, tags, and import all work" },
];

export default function ExportModal({
  open,
  onClose,
  building,
  error,
  onRetry,
  release,
  onSaveHtml,
  onCopyHtml,
  onSaveZip,
  savedKind,
  zipBusy,
  onToast,
}: Props) {
  const [copyBusy, setCopyBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!release || copyBusy) return;
    setCopyBusy(true);
    const ok = await copyText(release.html);
    setCopyBusy(false);
    if (ok) {
      onCopyHtml();
    } else {
      onToast("err", "Copy failed. Please use Download instead");
    }
  };

  return (
    <div className="anim-fade fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-rise max-h-[92vh] w-full max-w-[600px] overflow-y-auto rounded-xl border border-ink-600 bg-ink-850 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b border-ink-700 bg-ink-800 px-5 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-amber-acc/35 bg-amber-acc/10 text-amber-acc">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.5 7.3L12 12l-8.5-4.7" />
              <path d="M12 22V12" />
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-bold leading-tight text-mist-100">Release Build</h2>
            <p className="font-tc text-[10px] text-mist-500">portable single-file distribution — no install needed</p>
          </div>
          {release && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="rounded-full border border-amber-acc/45 bg-amber-acc/10 px-2 py-0.5 font-tc text-[10px] font-semibold text-amber-acc">{release.version}</span>
              <span className="hidden rounded-full border border-ink-600 px-2 py-0.5 font-tc text-[10px] text-mist-500 sm:inline">build {release.buildId}</span>
            </div>
          )}
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-mist-500 transition-colors hover:bg-ink-700 hover:text-mist-200" title="Close (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {building ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <svg className="h-6 w-6 animate-spin text-amber-acc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 019 9" /></svg>
              <p className="text-[13px] font-bold text-mist-200">Building release…</p>
              <p className="text-[12px] text-mist-500">Embedding JS/CSS into a single file (making it launchable via file://)</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e4604e" strokeWidth="1.8" strokeLinecap="round"><path d="M12 9v4m0 4h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
              <p className="max-w-[380px] text-[13px] text-mist-300">{error}</p>
              <button onClick={onRetry} className="mt-1 rounded-lg border border-amber-acc/50 px-4 py-2 text-[12px] font-bold text-amber-acc transition-all hover:bg-amber-acc/10 active:scale-95">Retry</button>
            </div>
          ) : release ? (
            <>
              {/* meta strip */}
              <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink-700 bg-ink-700 sm:grid-cols-4">
                {[
                  { k: "file size", v: fmtBytes(release.bytes) },
                  { k: "embedded js", v: `${release.jsKB} KB` },
                  { k: "embedded css", v: `${release.cssKB} KB` },
                  { k: "sha-256", v: release.sha256.slice(0, 12) + "…" },
                ].map((m) => (
                  <div key={m.k} className="bg-ink-850 px-3 py-2">
                    <p className="font-tc text-[9px] uppercase tracking-wider text-mist-600">{m.k}</p>
                    <p className="font-tc text-[12px] font-semibold text-mist-200">{m.v}</p>
                  </div>
                ))}
              </div>

              {/* route A — primary */}
              <div className="rounded-lg border border-amber-acc/40 bg-amber-acc/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-acc/15 font-tc text-[11px] font-bold text-amber-acc">A</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-bold text-mist-100">Download KoeDoku.html</p>
                      <span className="rounded bg-ink-700 px-1.5 py-0.5 font-tc text-[9.5px] text-teal-acc">recommended</span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-mist-400">
                      Save via the save dialog → <span className="text-mist-200">double-click the saved file</span> and it launches in the browser.
                      Since the program is fully embedded, there's no white screen from file:// restrictions.
                    </p>
                    <button
                      onClick={onSaveHtml}
                      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-bold transition-all active:scale-[0.98] ${
                        savedKind === "html"
                          ? "border border-teal-acc/60 bg-teal-deep/20 text-teal-acc"
                          : "border border-amber-acc/60 bg-amber-acc text-ink-950 shadow-[0_6px_20px_rgba(242,163,60,0.25)] hover:bg-amber-soft"
                      }`}
                    >
                      {savedKind === "html" ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
                          Saved — please double-click to launch
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                          Download (save dialog)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* route B — copy */}
              <div className="mt-3 rounded-lg border border-ink-600 bg-ink-800/60 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-ink-700 font-tc text-[11px] font-bold text-mist-300">B</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-mist-100">Copy the HTML code and create it yourself</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-mist-400">
                      For cases where downloads are restricted. Copy → paste into Notepad →
                      save as <span className="font-tc text-[11px] text-mist-200">KoeDoku.html</span> (type: all files, encoding: any) → double-click.
                    </p>
                    <button
                      onClick={handleCopy}
                      disabled={copyBusy}
                      className={`mt-3 flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-60 ${
                        savedKind === "copy"
                          ? "border-teal-acc/60 bg-teal-deep/15 text-teal-acc"
                          : "border-ink-500 text-mist-200 hover:border-teal-acc/50 hover:text-teal-acc"
                      }`}
                    >
                      {copyBusy ? (
                        <>
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 019 9" /></svg>
                          Copying…
                        </>
                      ) : savedKind === "copy" ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                          Copy the HTML code ({fmtBytes(release.bytes)})
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* route C — zip */}
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed border-ink-600 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold text-mist-300">ZIP version (for people who want a launcher)</p>
                  <p className="truncate font-tc text-[10px] text-mist-600">KoeDoku-release.zip — index.html + start.bat + start.sh + README</p>
                </div>
                <button
                  onClick={onSaveZip}
                  disabled={zipBusy}
                  className={`shrink-0 rounded-lg border px-3.5 py-2 text-[11.5px] font-bold transition-all active:scale-[0.98] disabled:opacity-60 ${
                    savedKind === "zip"
                      ? "border-teal-acc/60 bg-teal-deep/15 text-teal-acc"
                      : "border-ink-500 text-mist-300 hover:border-teal-acc/50 hover:text-teal-acc"
                  }`}
                >
                  {zipBusy ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 019 9" /></svg>
                      Packaging…
                    </span>
                  ) : savedKind === "zip" ? (
                    "Saved ✓"
                  ) : (
                    "ZIP download"
                  )}
                </button>
              </div>

              {/* steps */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                {STEPS.map((s) => (
                  <div key={s.n} className="rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-2">
                    <p className="font-tc text-[10px] font-bold text-amber-acc">{s.n}</p>
                    <p className="mt-0.5 text-[11.5px] font-bold leading-tight text-mist-200">{s.title}</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-mist-500">{s.desc}</p>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-center font-tc text-[9.5px] leading-relaxed text-mist-600">
                * The previous white-screen issue was caused by the browser blocking external JS reads via file://. In this release, the program is embedded in the HTML to resolve it.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
