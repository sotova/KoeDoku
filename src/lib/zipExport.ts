/* ============================================================
 * ポータブルZIPパッケージング
 * 実行中のビルド資産(index.html + assets/)を収集し、
 * JS / CSS を HTML へ完全インライン化した単一ファイルを生成する。
 * 単一ファイル化により、file:// プロトコルでのダブルクリック起動でも
 * ブラウザの CORS / モジュールブロックを受けずに動作する。
 * ============================================================ */
import JSZip from "jszip";

export interface ExportEntry {
  path: string;
  bytes: number;
  note?: string;
}

export interface ExportResult {
  name: string;
  blob: Blob;
  entries: ExportEntry[];
  totalBytes: number;
}

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

function makeReadme(name: string, fileCount: number, sizeMB: string): string {
  return [
    "=========================================================",
    "  KoeDoku (Voice Reading) - Voice Transcription / Subtitle Sync Studio",
    "  Portable Edition  " + name,
    "=========================================================",
    "",
    "■ How to launch",
    "  1. Right-click this ZIP -> \"Extract All\" (please extract to a folder)",
    "  2. Open the extracted folder",
    "  3. Double-click  start.bat  (macOS / Linux: ./start.sh)",
    "     - You can also just double-click index.html directly",
    "  4. KoeDoku will launch in your browser",
    "",
    "  * No internet connection is required for operation.",
    "  * All scripts and styles are embedded in index.html (single file),",
    "    so it works even when opened directly from file://.",
    "",
    "■ Contents (" + fileCount + " files / approx. " + sizeMB + " MB)",
    "  index.html ....... app body (JS / CSS embedded)",
    "  start.bat ........ Windows launcher (double-click to launch)",
    "  start.sh ......... macOS / Linux launcher",
    "  README.txt ....... this file",
    "",
    "■ Notes",
    "  * Imported audio and transcription data are saved in your browser's",
    "    local storage (localStorage / IndexedDB).",
    "  * This package is a prototype build of the app itself. The production version runs",
    "    faster-whisper (CUDA) + SQLite natively (see in-app documentation).",
    "",
  ].join("\r\n");
}

function collectAssetHrefs(): { htmlUrl: string; assetUrls: string[] } {
  const htmlUrl = new URL(document.baseURI);
  const seen = new Set<string>();
  const assetUrls: string[] = [];
  const push = (u: URL) => {
    if (u.origin !== location.origin) return;
    if (!/\/assets\/.+\.(js|css|woff2?|png|svg|ico)$/.test(u.pathname)) return;
    if (seen.has(u.pathname)) return;
    seen.add(u.pathname);
    assetUrls.push(u.href);
  };
  document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]").forEach((el) => {
    try {
      push(new URL(el.href, htmlUrl));
    } catch {
      /* noop */
    }
  });
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((el) => {
    try {
      push(new URL(el.src, htmlUrl));
    } catch {
      /* noop */
    }
  });
  return { htmlUrl: htmlUrl.href, assetUrls };
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function buildPortableZip(): Promise<ExportResult> {
  const zip = new JSZip();
  const entries: ExportEntry[] = [];

  const add = (path: string, data: Blob | string, note?: string) => {
    zip.file(path, data);
    const bytes = typeof data === "string" ? new Blob([data]).size : data.size;
    entries.push({ path, bytes, note });
  };

  const { htmlUrl, assetUrls } = collectAssetHrefs();
  const htmlRes = await fetch(htmlUrl);
  if (!htmlRes.ok) throw new Error("index.html fetch failed");
  let html = await htmlRes.text();

  /* JS / CSS を HTML へインライン化（file:// 起動を可能にする核心） */
  for (const url of assetUrls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`asset fetch failed: ${url}`);
    const text = await res.text();
    const base = url.split("/").pop() ?? "";
    const baseEsc = escRe(base);
    if (base.endsWith(".js")) {
      /* バンドル内に "</script" が含まれても壊れないようエスケープ */
      const safe = text.replace(/<\/script/gi, "<\\/script");
      html = html.replace(
        new RegExp(`<script[^>]*src="[^"]*${baseEsc}"[^>]*>\\s*</script>`),
        `<script type="module">${safe}</script>`
      );
    } else if (base.endsWith(".css")) {
      const safe = text.replace(/<\/style/gi, "<\\/style");
      html = html.replace(
        new RegExp(`<link[^>]*href="[^"]*${baseEsc}"[^>]*/?>`),
        `<style>${safe}</style>`
      );
    }
  }

  /* 安全策: 残ったルート絶対参照を相対へ（favicon 等） */
  html = html.replace(/(src|href)="\/(?!\/)/g, '$1="./');

  add("index.html", html, "app body (JS / CSS embedded)");
  add("start.bat", START_BAT, "Windows launcher");
  add("start.sh", START_SH, "macOS / Linux launcher");

  const name = "KoeDoku-portable.zip";
  const readme = makeReadme(name, entries.length + 1, (entries.reduce((a, e) => a + e.bytes, 0) / 1024 / 1024).toFixed(2));
  add("README.txt", readme);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { name, blob, entries, totalBytes: blob.size };
}

/* ---------------- 保存トリガ ---------------- */

type SaveOutcome = "saved" | "cancelled" | "failed";

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
}

/** 保存ダイアログ(優先) → 従来ダウンロード(フォールバック) */
export async function savePortableZip(r: ExportResult): Promise<SaveOutcome> {
  const w = window as SaveFilePickerWindow;
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: r.name,
        types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(r.blob);
      await writable.close();
      return "saved";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      return "failed";
    }
  }
  try {
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "saved";
  } catch {
    return "failed";
  }
}

/** 最終フォールバック: 別タブで開いてブラウザから保存してもらう */
export function openZipInNewTab(blob: Blob): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    return !!win;
  } catch {
    return false;
  }
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/* ---------------- text-route utilities (code copy & restore) ---------------- */

export const CODE_FILE_NAME = "koedoku-code.txt";
export const RESTORE_BAT_NAME = "restore-koedoku.bat";

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Windows標準のcertutilでBase64テキストからZIPを復元するスクリプト */
export function restoreBatScript(): string {
  return `@echo off
title KoeDoku ZIP Decoder
setlocal
set "SRC=koedoku-code.txt"
set "OUT=KoeDoku-portable.zip"

if not exist "%SRC%" (
  echo.
  echo [ERROR] %SRC% was not found in this folder.
  echo.
  echo Save the copied ZIP code as %SRC% here, then run again.
  echo.
  pause
  exit /b 1
)

certutil -decode "%SRC%" "%OUT%" >nul 2>&1

echo.
if exist "%OUT%" (
  echo [OK] %OUT% was created successfully.
  echo     Right-click the ZIP and choose "Extract all" to unpack it.
) else (
  echo [ERROR] Failed to restore the ZIP.
  echo     Make sure %SRC% contains the complete copied code,
  echo     saved with encoding ANSI or UTF-8 without BOM.
)
echo.
pause
endlocal
`;
}

/** クリップボードへコピー（セキュアコンテキスト外のフォールバック付き） */
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
