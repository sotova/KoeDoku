/* ============================================================
 * ポータブル ZIP 書出
 * 実行中のビルド（index.html + assets/*）を収集し、
 * Windows 用ランチャー（start.bat）と README を添えて ZIP 化する。
 * 解凍後に start.bat をダブルクリック → ブラウザで即起動。
 * ============================================================ */
import JSZip from "jszip";

export interface ExportResult {
  name: string;
  fileCount: number;
  bytes: number;
}

const ZIP_NAME = "KoeDoku-portable.zip";

const README_TXT = `============================================================
 声読 KoeDoku — 文字起こし・字幕同期スタジオ (Portable)
============================================================

■ 起動方法
  1. このフォルダを任意の場所へ解凍してください。
  2. start.bat をダブルクリック
     （または index.html を Chrome / Edge で開いてください）

■ 収録内容
  index.html ......... 本体
  assets/ ............ JS / CSS / フォント定義
  start.bat .......... Windows 用ランチャー
  README.txt ......... 本ファイル

■ データの保存先
  取込んだ音声・文字起こし・タグは、ご利用ブラウザの
  ローカルストレージ（localStorage / IndexedDB）に保存
  されます。ブラウザのプロファイルごとに独立します。

■ 注意事項
  ・Chrome / Edge での利用を推奨します。
  ・フォントはオフライン時にシステムフォントへ自動的に
    切替わります（機能への影響はありません）。
  ・本 ZIP はブラウザ完結のプロトタイプです。実機版
    （faster-whisper + CUDA + SQLite / start.exe 配布）の
    構成は、アプリ内の「実装アーキテクチャ」を参照。

============================================================
`;

const START_BAT = [
  "@echo off",
  "chcp 65001 >nul",
  "cd /d \"%~dp0\"",
  "title KoeDoku - Voice Reading Studio",
  "start \"\" \"index.html\"",
  "exit",
  "",
].join("\r\n");

const START_SH = ["#!/bin/sh", 'cd "$(dirname "$0")"', "open index.html 2>/dev/null || xdg-open index.html", ""].join("\n");

/** ページ内からビルド済み資産の URL を収集（同一オリジンの assets/ のみ） */
function collectAssetUrls(): { html: string; assets: { url: string; path: string }[] } {
  const base = document.baseURI;
  const basePath = new URL(base).pathname.replace(/[^/]*$/, "");
  const toRel = (abs: string): string | null => {
    try {
      const u = new URL(abs, base);
      if (u.origin !== location.origin) return null;
      let p = u.pathname;
      if (basePath && p.startsWith(basePath)) p = p.slice(basePath.length);
      p = p.replace(/^\//, "");
      if (!p.startsWith("assets/")) return null; // 外部注入スクリプト等を除外
      return p;
    } catch {
      return null;
    }
  };

  const assets: { url: string; path: string }[] = [];
  const seen = new Set<string>();
  const add = (src: string | null | undefined) => {
    if (!src) return;
    const rel = toRel(src);
    if (rel && !seen.has(rel)) {
      seen.add(rel);
      assets.push({ url: src, path: rel });
    }
  };

  document.querySelectorAll("script[src]").forEach((el) => add(el.getAttribute("src")));
  document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => add(el.getAttribute("href")));
  document.querySelectorAll('link[rel="modulepreload"]').forEach((el) => add(el.getAttribute("href")));

  return { html: base, assets };
}

/** ルート絶対参照（/assets/...）を相対参照（./assets/...）へ書換え */
function relativizeHtml(html: string): string {
  return html
    .replace(/(src|href)="\//g, '$1="./')
    .replace(/(src|href)='\/(?!\/)/g, "$1='./");
}

export async function exportPortableZip(): Promise<ExportResult> {
  const { html, assets } = collectAssetUrls();
  const zip = new JSZip();

  const htmlText = relativizeHtml(await (await fetch(html)).text());
  zip.file("index.html", htmlText);

  for (const a of assets) {
    const res = await fetch(a.url);
    if (!res.ok) throw new Error(`fetch failed: ${a.path}`);
    zip.file(a.path, await res.blob());
  }

  zip.file("start.bat", START_BAT);
  zip.file("start.sh", START_SH);
  zip.file("README.txt", README_TXT);

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 7 },
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = ZIP_NAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return { name: ZIP_NAME, fileCount: 3 + assets.length, bytes: blob.size };
}
