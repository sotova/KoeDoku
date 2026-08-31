import { useEffect } from "react";
import { fmtBytes, type ExportResult } from "../lib/zipExport";

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
  { title: "下のボタンでZIPを保存", desc: "保存ダイアログが開くので、デスクトップなど分かりやすい場所を選択" },
  { title: "ZIPを右クリック → すべて展開", desc: "ダウンロードフォルダ内の KoeDoku-portable.zip を展開" },
  { title: "展開したフォルダの start.bat をダブルクリック", desc: "macOS / Linux の場合は start.sh を実行" },
  { title: "ブラウザで起動完了", desc: "インターネット接続は不要。音声の取込・文字起こし・字幕同期がそのまま使えます" },
];

export default function ExportModal({ open, onClose, building, error, onRetry, result, onSave, onOpenTab, justSaved }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[3px]" onClick={onClose}>
      <div
        className="anim-rise w-full max-w-[700px] overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b border-ink-700 bg-ink-800 px-5 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-acc/40 bg-amber-acc/10 text-amber-acc">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8v13H3V8" />
              <path d="M1 3h22v5H1z" />
              <path d="M10 12h4" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-bold text-mist-100">ポータブル版を書き出す</h2>
            <p className="truncate font-tc text-[10px] text-mist-500">KoeDoku-portable.zip · オフライン動作 · Windows / macOS / Linux</p>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md border border-transparent text-mist-500 transition-all hover:border-ink-600 hover:text-mist-200 active:scale-90"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-5">
          {building ? (
            <div className="py-10">
              <div className="mx-auto mb-4 h-2 w-64 overflow-hidden rounded-full bg-ink-700">
                <div className="shimmer-bar h-full w-full rounded-full" />
              </div>
              <p className="text-center font-tc text-[12px] text-mist-400">パッケージを構築中…（ビルド資産を収集中）</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <svg className="mx-auto mb-3 text-coral-acc" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
              </svg>
              <p className="text-[13px] text-mist-300">{error}</p>
              <button
                onClick={onRetry}
                className="mt-4 rounded-md border border-amber-acc/50 px-4 py-1.5 text-[12px] font-bold text-amber-acc transition-all hover:bg-amber-acc/10 active:scale-95"
              >
                再試行
              </button>
            </div>
          ) : result ? (
            <div className="grid gap-5 md:grid-cols-[1fr_1.15fr]">
              {/* manifest */}
              <div>
                <p className="mb-2 font-tc text-[10px] tracking-wider text-mist-500">PACKAGE CONTENTS</p>
                <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900/70">
                  {result.entries.map((e) => (
                    <div key={e.path} className="flex items-center gap-2.5 border-b border-ink-800 px-3 py-2 last:border-b-0">
                      <FileIcon path={e.path} />
                      <span className="min-w-0 flex-1 truncate font-tc text-[11px] text-mist-200">{e.path}</span>
                      {e.note && (
                        <span className="hidden rounded-full border border-teal-deep/50 px-1.5 py-px font-tc text-[8.5px] text-teal-acc sm:inline">{e.note}</span>
                      )}
                      <span className="shrink-0 font-tc text-[10px] tabular-nums text-mist-600">{fmtBytes(e.bytes)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 flex items-center justify-between font-tc text-[10px] text-mist-500">
                  <span>{result.entries.length} ファイル</span>
                  <span className="text-amber-acc">計 {fmtBytes(result.totalBytes)}</span>
                </p>
                <p className="mt-1 font-tc text-[9.5px] leading-relaxed text-mist-600">
                  ※ 現在ブラウザで動いているビルドそのものです
                </p>
              </div>

              {/* install steps */}
              <div>
                <p className="mb-2 font-tc text-[10px] tracking-wider text-mist-500">INSTALL GUIDE</p>
                <ol className="space-y-2.5">
                  {STEPS.map((s, i) => (
                    <li key={s.title} className="flex gap-3">
                      <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full border border-amber-acc/50 bg-amber-acc/10 font-tc text-[11px] font-bold text-amber-acc">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-bold leading-snug text-mist-100">{s.title}</p>
                        <p className="text-[11px] leading-snug text-mist-500">{s.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 rounded-lg border border-ink-600 bg-ink-800/60 px-3 py-2.5">
                  <p className="text-[10.5px] leading-relaxed text-mist-500">
                    取り込んだ音声・文字起こし・タグは<span className="text-mist-300">ブラウザのローカル保存領域</span>に保持されます。
                    ダウンロードがブロックされた場合は、アドレスバーの案内から許可してください。
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* footer */}
        <div className="flex flex-col gap-2 border-t border-ink-700 bg-ink-800/70 px-5 py-3.5 sm:flex-row sm:items-center">
          <button
            onClick={onSave}
            disabled={!result || building}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
              justSaved
                ? "border border-teal-acc/60 bg-teal-deep/25 text-teal-acc"
                : "bg-amber-acc text-ink-950 hover:bg-amber-soft shadow-[0_6px_24px_rgba(242,163,60,0.25)]"
            }`}
          >
            {justSaved ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
                保存しました — フォルダを確認してください
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                  <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                ZIPをこのパソコンに保存
              </>
            )}
          </button>
          <button
            onClick={onOpenTab}
            disabled={!result || building}
            className="rounded-lg border border-ink-600 px-4 py-2.5 text-[12px] font-bold text-mist-400 transition-all hover:border-ink-500 hover:text-mist-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            title="保存ダイアログが使えない場合の代替手段"
          >
            別タブで開く（代替手段）
          </button>
        </div>
      </div>
    </div>
  );
}
