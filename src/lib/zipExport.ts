/* ============================================================
 * リリースビルドジェネレータ
 * 実行中のビルド資産(JS/CSS)を index.html へ完全インライン化した
 * 「単一 HTML リリース」を生成する。外部参照ゼロのため、
 * ブラウザの file:// モジュールブロック制限を受けず、
 * ダブルクリックだけで起動できる。
 * 副産物として start.bat 同梱の ZIP も生成可能。
 * ============================================================ */
import JSZip from "jszip";

export const RELEASE_VERSION = "v1.0.0";

export interface ReleaseBuild {
  version: string;
  buildId: string;
  sha256: string;
  html: string;
  blob: Blob;
  bytes: number;
  jsKB: number;
  cssKB: number;
  assetCount: number;
}

export interface ZipPackage {
  name: string;
  blob: Blob;
  entries: { path: string; note: string }[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeScriptContent(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

/* ---------------- asset collection (DOM + resource timing) ---------------- */

export function collectAssetUrls(): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const accept = (href: string) => {
    try {
      const u = new URL(href, document.baseURI);
      if (u.origin !== location.origin) return;
      if (!/\/assets\/.+\.(js|css|woff2?|png|svg|ico)$/.test(u.pathname)) return;
      if (seen.has(u.pathname)) return;
      seen.add(u.pathname);
      urls.push(u.href);
    } catch {
      /* noop */
    }
  };
  document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]").forEach((el) => accept(el.href));
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((el) => accept(el.src));
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (const e of entries) {
      if (e.initiatorType === "script" || e.initiatorType === "link" || e.initiatorType === "css") accept(e.name);
    }
  } catch {
    /* noop */
  }
  return urls;
}

export function getBuildId(): string {
  let h = 2166136261;
  for (const u of collectAssetUrls()) {
    for (let i = 0; i < u.length; i++) {
      h ^= u.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* ---------------- page html ---------------- */

/** fetch 失敗時のフォールバックシェル（資産側がすべてを持つためこれで十分） */
function synthesizeShell(): string {
  const title = document.title || "KoeDoku";
  const pre = [...document.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')].map((l) => l.outerHTML).join("\n");
  const fonts = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis"]')]
    .map((l) => l.outerHTML)
    .join("\n");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
${pre}
${fonts}
</head>
<body>
<div id="root"></div>
</body>
</html>`;
}

async function fetchPageHtml(): Promise<string> {
  const candidates = [...new Set([document.baseURI, location.href, new URL("index.html", document.baseURI).href])];
  for (const c of candidates) {
    try {
      const res = await fetch(c, { cache: "no-cache" });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.includes("<div id=") || text.includes("<html")) return text;
    } catch {
      /* next candidate */
    }
  }
  return synthesizeShell();
}

async function sha256Hex(blob: Blob): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "n/a";
  }
}

/* ---------------- release build ---------------- */

export async function buildRelease(): Promise<ReleaseBuild> {
  const assetUrls = collectAssetUrls();
  let html = await fetchPageHtml();

  let jsBytes = 0;
  let cssBytes = 0;
  let injectedJs = 0;
  let injectedCss = 0;
  let pendingJs = "";
  let pendingCss = "";

  for (const url of assetUrls) {
    let text = "";
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      text = await res.text();
    } catch {
      continue;
    }
    const rel = new URL(url).pathname.replace(/^\//, "");
    const variants = [url, "/" + rel, rel];

    if (rel.endsWith(".js")) {
      jsBytes += text.length;
      pendingJs = text;
      for (const v of variants) {
        const re = new RegExp(`<script[^>]*src=["']${escapeRegExp(v)}["'][^>]*>\\s*</script>`, "g");
        const next = html.replace(re, () => {
          injectedJs++;
          return `<script type="module">${escapeScriptContent(text)}</script>`;
        });
        if (next !== html) {
          html = next;
          break;
        }
      }
    } else if (rel.endsWith(".css")) {
      cssBytes += text.length;
      pendingCss += text;
      for (const v of variants) {
        const re = new RegExp(`<link[^>]*href=["']${escapeRegExp(v)}["'][^>]*>`, "g");
        const next = html.replace(re, () => {
          injectedCss++;
          return `<style>${text}</style>`;
        });
        if (next !== html) {
          html = next;
          break;
        }
      }
    }
  }

  // タグが見つからなかった場合の確実なフォールバック注入
  if (pendingJs && injectedJs === 0) {
    const tag = `<script type="module">${escapeScriptContent(pendingJs)}</script>`;
    html = html.includes("</body>") ? html.replace("</body>", `${tag}\n</body>`) : html + tag;
  }
  if (pendingCss && injectedCss === 0) {
    const tag = `<style>${pendingCss}</style>`;
    html = html.includes("</head>") ? html.replace("</head>", `${tag}\n</head>`) : tag + html;
  }

  // file:// 起動を妨げる要素を除去
  html = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
  html = html.replace(/<link[^>]*rel=["'](?:modulepreload|preload|prefetch)["'][^>]*>/g, "");
  html = html.replace(/<link[^>]*rel=["']icon["'][^>]*href=["']\/[^"']+["'][^>]*>/g, "");
  html = html.replace(/(src|href)="\/(?!\/)/g, '$1="./');

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return {
    version: RELEASE_VERSION,
    buildId: getBuildId(),
    sha256: await sha256Hex(blob),
    html,
    blob,
    bytes: blob.size,
    jsKB: Math.round(jsBytes / 1024),
    cssKB: Math.round(cssBytes / 1024),
    assetCount: assetUrls.length,
  };
}

/* ---------------- ZIP (launcher bundle) ---------------- */

const START_BAT = `@echo off
chcp 65001 >nul
title KoeDoku - Voice Transcription / Subtitle Sync Studio
echo.
echo   KoeDoku - Starting up...
echo.
cd /d "%~dp0"
start "" "index.html"
exit
`;

const START_SH = `#!/bin/sh
cd "$(dirname "$0")"
if command -v open >/dev/null 2>&1; then
  open index.html
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open index.html
else
  echo "Please open index.html in your browser."
fi
`;

function makeReadme(r: ReleaseBuild, sizeMB: string): string {
  return [
    "=========================================================",
    "  KoeDoku (Voice Reading) - Voice Transcription / Subtitle Sync Studio",
    `  Release ${r.version}  (build ${r.buildId})  /  approx. ${sizeMB} MB`,
    "=========================================================",
    "",
    "■ How to launch (no install needed)",
    "  1. Right-click this ZIP -> \"Extract All\"",
    "  2. Double-click  index.html  inside the extracted folder",
    "     (start.bat / start.sh also work)",
    "  3. KoeDoku will launch in your browser",
    "",
    "  * index.html is a single-file release with the program (JS/CSS)",
    "    fully embedded. It is not affected by the browser's",
    "    file:// loading restrictions.",
    "  * No internet connection is required for operation.",
    "",
    "■ Verification",
    `  SHA-256: ${r.sha256}`,
    "",
    "■ Notes",
    "  * Imported audio and transcription data are saved in your browser's",
    "    local storage (localStorage / IndexedDB).",
    "  * This package is a prototype build of the app itself. The production version runs",
    "    faster-whisper (CUDA) + SQLite natively (see in-app documentation).",
    "",
  ].join("\r\n");
}

export async function buildPortableZipFromRelease(r: ReleaseBuild): Promise<ZipPackage> {
  const zip = new JSZip();
  zip.file("index.html", r.html);
  zip.file("start.bat", START_BAT);
  zip.file("start.sh", START_SH);
  const name = "KoeDoku-release.zip";
  zip.file("README.txt", makeReadme(r, (r.bytes / 1024 / 1024).toFixed(2)));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return {
    name,
    blob,
    entries: [
      { path: "index.html", note: `single-file release (JS/CSS embedded, ${fmtBytes(r.bytes)})` },
      { path: "start.bat", note: "Windows launcher" },
      { path: "start.sh", note: "macOS / Linux launcher" },
      { path: "README.txt", note: "how to launch" },
    ],
  };
}

/* ---------------- save / copy ---------------- */

export type SaveOutcome = "saved" | "cancelled" | "failed";

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
}

/** save dialog (preferred) → conventional download (fallback) */
export async function saveBlobAs(name: string, blob: Blob, mime: string, ext: string): Promise<SaveOutcome> {
  const w = window as SaveFilePickerWindow;
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: mime, accept: { [mime]: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      return "failed";
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "saved";
  } catch {
    return "failed";
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
