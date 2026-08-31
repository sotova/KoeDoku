import { useMemo, useRef, useState } from "react";
import { fmtDate, fmtTime, type FileRec } from "../lib/types";

interface Props {
  files: FileRec[];
  totalCount: number;
  allTags: { tag: string; count: number }[];
  activeTags: string[];
  onToggleTag: (t: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  jobFileIds: Set<string>;
  onImport: (files: FileList) => void;
  onAddDemo: () => void;
  onReset: () => void;
  onAddTag: (id: string, t: string) => void;
  onRemoveTag: (id: string, t: string) => void;
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#161f2a" stroke="#2b3c50" />
      <g fill="#f2a33c">
        <rect x="6" y="12" width="3" height="8" rx="1.5" />
        <rect x="11" y="7" width="3" height="18" rx="1.5" />
        <rect x="16" y="10" width="3" height="12" rx="1.5" />
        <rect x="21" y="4" width="3" height="24" rx="1.5" />
      </g>
    </svg>
  );
}

export default function Sidebar(props: Props) {
  const {
    files, totalCount, allTags, activeTags, onToggleTag, selectedId, onSelect, onDelete,
    query, onQuery, jobFileIds, onImport, onAddDemo, onReset, onAddTag, onRemoveTag,
  } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tagDraft, setTagDraft] = useState("");
  const selected = files.find((f) => f.id === selectedId) ?? null;
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const tagSuggestions = useMemo(() => allTags.map((t) => t.tag), [allTags]);

  const submitTag = () => {
    const t = tagDraft.trim();
    if (!t || !selected) return;
    onAddTag(selected.id, t);
    setTagDraft("");
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-ink-700 bg-ink-900/85">
      {/* brand */}
      <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-3.5">
        <Logo />
        <div className="leading-tight">
          <div className="font-display text-[19px] font-extrabold tracking-[0.08em] text-mist-100">
            声読<span className="ml-1.5 font-tc text-[11px] font-medium tracking-normal text-amber-acc">KoeDoku</span>
          </div>
          <div className="font-tc text-[9.5px] text-mist-600">transcribe · sync · archive</div>
        </div>
        <span className="ml-auto rounded border border-ink-600 px-1.5 py-0.5 font-tc text-[9px] text-mist-500">v0.9</span>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2 px-3 pt-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.aac"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onImport(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="group flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-acc px-3 py-2 text-[13px] font-bold text-ink-950 shadow-[0_4px_16px_rgba(242,163,60,0.25)] transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          音声を取込
        </button>
        <button
          onClick={onAddDemo}
          title="デモデータを追加"
          className="grid h-9 w-9 place-items-center rounded-lg border border-ink-600 text-mist-400 transition-all hover:border-teal-acc/50 hover:text-teal-acc active:scale-90"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1M7.7 16.3l-2.1 2.1" />
          </svg>
        </button>
        <button
          onClick={onReset}
          title="DBを初期化してデモを再投入"
          className="grid h-9 w-9 place-items-center rounded-lg border border-ink-600 text-mist-400 transition-all hover:border-coral-acc/50 hover:text-coral-acc active:scale-90"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 109-9" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
      </div>

      {/* search */}
      <div className="px-3 pt-3">
        <div className="group relative">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-600 transition-colors group-focus-within:text-amber-acc" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="ファイル名・字幕本文を検索"
            className="w-full rounded-lg border border-ink-600 bg-ink-850 py-2 pl-9 pr-8 text-[12.5px] text-mist-100 placeholder:text-mist-600 transition-all focus:border-amber-acc/60 focus:outline-none focus:ring-2 focus:ring-amber-acc/15"
          />
          {query && (
            <button
              onClick={() => onQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mist-600 transition-colors hover:text-mist-200"
              title="クリア"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* tag filter */}
      <div className="px-3 pt-3">
        <p className="mb-1.5 flex items-center gap-1.5 font-tc text-[9.5px] uppercase tracking-[0.14em] text-mist-600">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12l-8 8-8-8V4h8l8 8z" strokeLinejoin="round" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" /></svg>
          タグで絞り込み
        </p>
        {allTags.length === 0 ? (
          <p className="pb-1 text-[11px] text-mist-600">タグはまだありません</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(({ tag, count }) => {
              const on = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => onToggleTag(tag)}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] transition-all active:scale-95 ${
                    on
                      ? "border-teal-acc/60 bg-teal-deep/20 text-teal-acc"
                      : "border-ink-600 bg-ink-850 text-mist-500 hover:border-ink-500 hover:text-mist-300"
                  }`}
                >
                  <span className={`grid h-3 w-3 place-items-center rounded-[3px] border transition-colors ${on ? "border-teal-acc bg-teal-acc" : "border-ink-500"}`}>
                    {on && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0e141b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
                    )}
                  </span>
                  {tag}
                  <span className={`font-tc text-[9px] ${on ? "text-teal-acc/80" : "text-mist-600"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* file list */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <p className="flex items-baseline gap-2 border-y border-ink-700 bg-ink-850/60 px-4 py-1.5">
          <span className="font-tc text-[9.5px] uppercase tracking-[0.14em] text-mist-600">files</span>
          <span className="font-tc text-[10px] text-mist-500">
            {files.length} / {totalCount}
          </span>
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {files.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[12.5px] text-mist-500">条件に一致するファイルがありません</p>
              <p className="mt-1 font-tc text-[10px] text-mist-600">SELECT * FROM files → 0 rows</p>
            </div>
          ) : (
            files.map((f) => {
              const sel = f.id === selectedId;
              const busy = jobFileIds.has(f.id);
              return (
                <div
                  key={f.id}
                  onClick={() => onSelect(f.id)}
                  className={`group relative mb-1 cursor-pointer rounded-lg border px-3 py-2.5 transition-all duration-150 ${
                    sel
                      ? "border-amber-acc/50 bg-ink-750 shadow-[0_2px_14px_rgba(242,163,60,0.08)]"
                      : "border-transparent hover:translate-x-0.5 hover:border-ink-600 hover:bg-ink-800"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-0.5 shrink-0 ${busy ? "text-amber-acc" : sel ? "text-amber-acc" : "text-mist-600 group-hover:text-mist-400"}`}>
                      {busy ? (
                        <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 019 9" /></svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18V6l10-2v11" />
                          <circle cx="6.5" cy="18" r="2.5" />
                          <circle cx="16.5" cy="15" r="2.5" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[12.5px] font-bold leading-snug ${sel ? "text-mist-100" : "text-mist-300"}`}>
                        {f.name}
                      </p>
                      <p className="mt-0.5 font-tc text-[9.5px] text-mist-600">
                        {busy ? (
                          <span className="text-amber-acc/90">文字起こし実行中…</span>
                        ) : (
                          <>
                            {fmtTime(f.duration)} · {f.model} · {fmtDate(f.createdAt)}
                          </>
                        )}
                      </p>
                      {f.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {f.tags.map((t) => (
                            <span key={t} className="rounded border border-teal-deep/40 bg-teal-deep/10 px-1.5 py-px text-[9.5px] text-teal-acc/90">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {confirmDel === f.id ? (
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-coral-acc/40 bg-ink-900 px-1.5 py-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { onDelete(f.id); setConfirmDel(null); }} className="rounded bg-coral-acc px-1.5 py-0.5 text-[10px] font-bold text-ink-950 hover:brightness-110">削除</button>
                      <button onClick={() => setConfirmDel(null)} className="rounded px-1 py-0.5 text-[10px] text-mist-400 hover:text-mist-200">取消</button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDel(f.id); }}
                      title="ファイルを削除"
                      className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded text-mist-600 opacity-0 transition-all hover:bg-coral-acc/15 hover:text-coral-acc group-hover:opacity-100"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12a2 2 0 01-2 1.9H8.8a2 2 0 01-2-1.9L6 7" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* tag editor for selected */}
      {selected && (
        <div className="border-t border-ink-700 bg-ink-850/70 px-3 py-2.5">
          <p className="mb-1.5 flex items-center justify-between font-tc text-[9.5px] uppercase tracking-[0.14em] text-mist-600">
            <span>タグ編集 — 選択中ファイル</span>
            <span className="normal-case tracking-normal text-mist-500">{selected.tags.length} 個</span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.tags.length === 0 && <span className="text-[11px] text-mist-600">タグなし</span>}
            {selected.tags.map((t) => (
              <span key={t} className="group/chip flex items-center gap-1 rounded-full border border-teal-deep/50 bg-teal-deep/15 py-[3px] pl-2 pr-1 text-[11px] text-teal-acc transition-colors hover:border-coral-acc/50 hover:bg-coral-acc/10">
                #{t}
                <button
                  onClick={() => onRemoveTag(selected.id, t)}
                  className="grid h-4 w-4 place-items-center rounded-full text-teal-acc/70 transition-colors hover:bg-coral-acc hover:text-ink-950"
                  title={`「${t}」を削除`}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitTag()}
              list="koedoku-tag-suggest"
              placeholder="新しいタグを追加…"
              className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-[12px] text-mist-100 placeholder:text-mist-600 focus:border-teal-acc/60 focus:outline-none"
            />
            <datalist id="koedoku-tag-suggest">
              {tagSuggestions.map((t) => <option key={t} value={t} />)}
            </datalist>
            <button
              onClick={submitTag}
              className="rounded-md border border-teal-deep/60 bg-teal-deep/20 px-2.5 text-[11px] font-bold text-teal-acc transition-all hover:bg-teal-deep/35 active:scale-95"
            >
              追加
            </button>
          </div>
        </div>
      )}

      <p className="border-t border-ink-700 px-4 py-2 font-tc text-[9px] leading-relaxed text-mist-600">
        local-only · db.sqlite3 <span className="text-teal-acc/70">simulated</span> · GPU: RTX 3050
      </p>
    </aside>
  );
}
