import { useEffect, useState } from "react";
import {
  blobToBase64,
  CODE_FILE_NAME,
  copyText,
  fmtBytes,
  RESTORE_BAT_NAME,
  restoreBatScript,
  type ExportResult,
} from "../lib/zipExport";

interface Props {
  open: boolean;
  onClose: () => void;
  building: boolean;
  error: string | null;
  onRetry: () => void;
  result: ExportResult | null;
  onSave: () => void;
  onOpenTab: () => void;
  justSaved: boolean;
  onToast?: (kind: "ok" | "info" | "err", text: string) => void;
}

function FileIcon({ path }: { path: string }) {
  const cls = "shrink-0";
  if (path.endsWith(".bat") || path.endsWith(".sh"))
    return (
      <svg className={cls} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3bc8b4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17l6-5-6-5" />
        <path d="M12 19h8" />
      </svg>
    );
  if (path.endsWith(".txt"))
    return (
      <svg className={cls} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93a7bb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </svg>
    );
  if (path.endsWith(".html"))
    return (
      <svg className={cls} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f2a33c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
      </svg>
    );
  if (path.endsWith(".css") || path.endsWith(".js"))
    return (
      <svg className={cls} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd8c9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H7a2 2 0 00-2 2v4a2 2 0 01-2 2 2 2 0 012 2v4a2 2 0 002 2h1" />
        <path d="M16 3h1a2 2 0 012 2v4a2 2 0 002 2 2 2 0 00-2 2v4a2 2 0 01-2 2h-1" />
      </svg>
    );
  return (
    <svg className={cls} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93a7bb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

const STEPS: { title: string; desc: string }[] = [
  { title: "いずれかの方法でZIPを保存", desc: "下の3ルートから、お使いの環境で使えるものを選択" },
  { title: "ZIPを右クリック → すべて展開", desc: "保存した KoeDoku-portable.zip を展開" },
  { title: "展開したフォルダの start.bat をダブルクリック", desc: "index.html を直接ダブルクリックでも起動できます（JS/CSSは単一ファイルに内蔵済み）。macOS / Linux は start.sh" },
  { title: "ブラウザで起動完了", desc: "インターネット接続は不要。音声の取込・文字起こし・字幕同期がそのまま使えます" },
];

export default function ExportModal({ open, onClose, building, error, onRetry, result, onSave, onOpenTab, justSaved, onToast }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [copied, setCopied] = useState<"code" | "bat" | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* パッケージができたらBase64コードを生成（テキスト復元ルート用） */
  useEffect(() => {
    if (!open || !result || code !== null || codeLoading) return;
    setCodeLoading(true);
    blobToBase64(result.blob)
      .then(setCode)
      .catch(() => setCode(null))
      .finally(() => setCodeLoading(false));
  }, [open, result, code, codeLoading]);

  const doCopy = async (which: "code" | "bat") => {
    const text = which === "code" ? code : restoreBatScript();
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2600);
      onToast?.("ok", which === "code" ? `ZIPコード（${fmtBytes(text.length)}）をコピーしました` : "復元スクリプトをコピーしました");
    } else {
      onToast?.("err", "コピーできませんでした。テキストを直接選択してコピーしてください");
    }
  };

  if (!open) return null;

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-rise flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-[0_28px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-2.5 border-b border-ink-700 bg-ink-800 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-teal-deep/50 bg-teal-deep/15 text-teal-acc">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8" />
              <path d="M1 3h22v5H1zM10 12h4" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold text-mist-100">ポータブル版を取得する</h2>
            <p className="font-tc text-[9.5px] text-mist-500">KoeDoku-portable.zip — このチャットはファイル添付に対応していないため、PC内で生成して受け渡します</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-md p-1.5 text-mist-500 transition-colors hover:bg-ink-700 hover:text-mist-200" aria-label="閉じる">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/* status / build progress */}
          {building && (
            <div className="flex items-center gap-3 rounded-lg border border-ink-600 bg-ink-800 px-4 py-3.5">
              <svg className="h-4 w-4 animate-spin text-amber-acc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 019 9" /></svg>
              <p className="text-[12.5px] text-mist-300">単一ファイルへJS/CSSを内蔵中…（file:// 起動に対応）</p>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-coral-acc/40 bg-coral-acc/10 px-4 py-3">
              <svg className="h-4 w-4 shrink-0 text-coral-acc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
              <p className="text-[12px] text-mist-200">{error}</p>
              <button onClick={onRetry} className="ml-auto shrink-0 rounded-md border border-coral-acc/50 px-2.5 py-1 text-[11px] font-bold text-coral-acc hover:bg-coral-acc/10">再試行</button>
            </div>
          )}

          {result && !building && !error && (
            <>
              {/* package summary */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-ink-600 px-2.5 py-1 font-tc text-[10px] text-mist-300">{result.entries.length} ファイル</span>
                <span className="rounded-full border border-ink-600 px-2.5 py-1 font-tc text-[10px] text-mist-300">{fmtBytes(result.totalBytes)}</span>
                <span className="rounded-full border border-teal-deep/50 bg-teal-deep/10 px-2.5 py-1 font-tc text-[10px] text-teal-acc">オフライン動作</span>
              </div>

              {/* ── ルート① 直接保存 ── */}
              <div className="anim-rise rounded-lg border-l-2 border-amber-acc bg-ink-800/80 p-3.5" style={{ animationDelay: "0.02s" }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-display text-[13.5px] font-bold text-mist-100">① 直接保存する（おすすめ）</span>
                  <span className="rounded-full border border-ink-600 px-2 py-0.5 font-tc text-[9px] text-mist-500">デスクトップ版 Chrome / Edge</span>
                </div>
                <p className="mb-2.5 text-[11.5px] leading-relaxed text-mist-400">保存ダイアログが開くので、デスクトップなど好きな場所を指定して保存します。</p>
                <button
                  onClick={onSave}
                  className={`w-full rounded-md border px-3 py-2 text-[12.5px] font-bold transition-all active:scale-[0.98] ${
                    justSaved
                      ? "border-teal-acc/60 bg-teal-deep/15 text-teal-acc"
                      : "border-amber-acc/60 bg-amber-acc/10 text-amber-acc hover:bg-amber-acc/20"
                  }`}
                >
                  {justSaved ? "✓ 保存しました — 次はZIPを展開してください" : "ZIPをこのパソコンに保存"}
                </button>
              </div>

              {/* ── ルート② コピー&復元 ── */}
              <div className="anim-rise mt-3 rounded-lg border-l-2 border-teal-acc bg-ink-800/80 p-3.5" style={{ animationDelay: "0.08s" }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-display text-[13.5px] font-bold text-mist-100">② コードをコピーして復元する（万能）</span>
                  <span className="rounded-full border border-teal-deep/50 bg-teal-deep/10 px-2 py-0.5 font-tc text-[9px] text-teal-acc">保存がブロックされる環境でも可</span>
                </div>
                <ol className="mb-2.5 space-y-1.5 text-[11.5px] leading-relaxed text-mist-400">
                  <li><span className="font-tc text-teal-acc">1.</span> 下のボタンで<b className="text-mist-200">ZIPコード</b>と<b className="text-mist-200">復元スクリプト</b>をそれぞれコピー</li>
                  <li><span className="font-tc text-teal-acc">2.</span> PCでメモ帳を開き、ZIPコードを貼り付けて <code className="rounded bg-ink-900 px-1 font-tc text-[10.5px] text-amber-acc">{CODE_FILE_NAME}</code> として保存（文字コードは <b className="text-mist-200">ANSI</b> または BOMなしUTF-8）</li>
                  <li><span className="font-tc text-teal-acc">3.</span> 復元スクリプトも同フォルダに <code className="rounded bg-ink-900 px-1 font-tc text-[10.5px] text-amber-acc">{RESTORE_BAT_NAME}</code> として保存（種類は「すべてのファイル」）</li>
                  <li><span className="font-tc text-teal-acc">4.</span> <code className="rounded bg-ink-900 px-1 font-tc text-[10.5px] text-amber-acc">{RESTORE_BAT_NAME}</code> をダブルクリック → 同フォルダにZIPが生成されます</li>
                </ol>

                {/* code preview */}
                <div className="mb-2.5 rounded-md border border-ink-700 bg-ink-950 px-3 py-2">
                  {codeLoading ? (
                    <p className="font-tc text-[10.5px] text-mist-600">コード生成中…</p>
                  ) : code ? (
                    <p className="break-all font-tc text-[10px] leading-relaxed text-mist-600">
                      <span className="text-teal-acc">{code.slice(0, 90)}</span>
                      … <span className="text-mist-500">（全 {code.length.toLocaleString()} 文字 / 約 {fmtBytes(code.length)}）</span>
                    </p>
                  ) : (
                    <p className="font-tc text-[10.5px] text-coral-acc">コードの生成に失敗しました</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => doCopy("code")}
                    disabled={!code || codeLoading}
                    className={`rounded-md border px-3 py-2 text-[11.5px] font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                      copied === "code"
                        ? "border-teal-acc/60 bg-teal-deep/15 text-teal-acc"
                        : "border-teal-deep/60 bg-teal-deep/10 text-teal-acc hover:bg-teal-deep/25"
                    }`}
                  >
                    {copied === "code" ? "✓ コピーしました" : "ZIPコードをコピー"}
                  </button>
                  <button
                    onClick={() => doCopy("bat")}
                    className={`rounded-md border px-3 py-2 text-[11.5px] font-bold transition-all active:scale-[0.98] ${
                      copied === "bat"
                        ? "border-teal-acc/60 bg-teal-deep/15 text-teal-acc"
                        : "border-ink-600 text-mist-300 hover:border-teal-deep/60 hover:text-teal-acc"
                    }`}
                  >
                    {copied === "bat" ? "✓ コピーしました" : "復元スクリプトをコピー"}
                  </button>
                </div>
                <p className="mt-2 font-tc text-[9.5px] leading-relaxed text-mist-600">
                  ※ 復元スクリプトは Windows 標準の certutil を使うため追加ソフト不要です（macOS/Linux の場合は base64 -d コマンドでも復元できます）
                </p>
              </div>

              {/* ── ルート③ 別タブ ── */}
              <div className="anim-rise mt-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3.5" style={{ animationDelay: "0.14s" }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[12.5px] font-bold text-mist-400">③ 別タブで開く（最終手段）</span>
                  <span className="rounded-full border border-ink-600 px-2 py-0.5 font-tc text-[9px] text-mist-600">環境によりブロックされる場合あり</span>
                </div>
                <button onClick={onOpenTab} className="w-full rounded-md border border-ink-600 px-3 py-1.5 text-[11.5px] text-mist-400 transition-all hover:border-mist-500 hover:text-mist-200 active:scale-[0.98]">
                  別タブで開く
                </button>
              </div>

              {/* contents */}
              <div className="mt-4 rounded-lg border border-ink-700 bg-ink-900/50 p-3">
                <p className="mb-2 font-tc text-[9.5px] uppercase tracking-wider text-mist-600">ZIP contents</p>
                <ul className="space-y-1">
                  {result.entries.map((e) => (
                    <li key={e.path} className="flex items-center gap-2 text-[11px]">
                      <FileIcon path={e.path} />
                      <span className="font-tc text-mist-300">{e.path}</span>
                      {e.note && <span className="hidden text-mist-600 sm:inline">— {e.note}</span>}
                      <span className="ml-auto font-tc text-[10px] tabular-nums text-mist-600">{fmtBytes(e.bytes)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* install steps */}
              <div className="mt-4">
                <p className="mb-2 font-tc text-[9.5px] uppercase tracking-wider text-mist-600">起動までの手順</p>
                <ol className="space-y-2.5">
                  {STEPS.map((s, i) => (
                    <li key={s.title} className="flex gap-3">
                      <span className="grid shrink-0 place-items-center rounded-full border border-amber-acc/50 bg-amber-acc/10 font-tc text-[10px] font-bold text-amber-acc" style={{ width: 22, height: 22 }}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-mist-200">{s.title}</p>
                        <p className="text-[11px] leading-relaxed text-mist-500">{s.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
