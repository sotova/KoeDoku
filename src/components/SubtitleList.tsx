/* ============================================================
 * 字幕リスト — タイムスタンプクリックでシーク&再生
 * 再生中の行をハイライト / 単語単位のカラオケ同期
 * ============================================================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { spokenChars, type TimedToken } from "../lib/audio";
import { fmtTime, type Segment } from "../lib/types";

interface Props {
  segments: Segment[];
  time: number;
  playing: boolean;
  onSeek: (t: number) => void;
  query: string;
  segmentsJson: string | null;
  meta: { model: string; engine: string } | null;
  status: "ready" | "transcribing";
}

function escRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, q }: { text: string; q: string }) {
  const parts = useMemo(() => {
    if (!q) return null;
    const re = new RegExp(`(${escRe(q)})`, "gi");
    return text.split(re);
  }, [text, q]);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>
      )}
    </>
  );
}

export default function SubtitleList({ segments, time, playing, onSeek, query, segmentsJson, meta, status }: Props) {
  const [follow, setFollow] = useState(true);
  const [showJson, setShowJson] = useState(false);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const activeIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= time) idx = i;
      else break;
    }
    if (idx >= 0 && idx < segments.length && time > segments[idx].end + 0.8) {
      // gap: keep idx (行間は直前の行を薄く維持)
    }
    return idx;
  }, [segments, time]);

  const inGap = activeIdx >= 0 && time > (segments[activeIdx]?.end ?? 0);

  useEffect(() => {
    if (!follow || activeIdx < 0) return;
    const el = rowRefs.current[activeIdx];
    if (el && listRef.current) {
      const lr = listRef.current.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.top < lr.top + 8 || er.bottom > lr.bottom - 8) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [activeIdx, follow]);

  const q = query.trim();
  const visible = useMemo(() => {
    if (!q) return segments.map((s, i) => ({ s, i }));
    return segments.map((s, i) => ({ s, i })).filter(({ s }) => s.text.toLowerCase().includes(q.toLowerCase()));
  }, [segments, q]);

  const totalChars = useMemo(() => segments.reduce((a, s) => a + s.text.length, 0), [segments]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-2">
        <h2 className="font-display text-[15px] font-bold tracking-wide text-mist-100">字幕セグメント</h2>
        <span className="rounded-full border border-ink-600 px-2 py-0.5 font-tc text-[10px] text-mist-400">
          {q ? `${visible.length} / ${segments.length} 件` : `${segments.length} 件`}
        </span>
        <span className="hidden font-tc text-[10px] text-mist-600 md:inline">{totalChars.toLocaleString()} 文字</span>
        <div className="ml-auto flex items-center gap-2">
          {meta && (
            <span className="hidden items-center gap-1.5 rounded-full border border-teal-deep/50 bg-teal-deep/15 px-2 py-0.5 font-tc text-[10px] text-teal-acc lg:inline-flex">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" fill="#0e141b" /></svg>
              {meta.model} · {meta.engine}
            </span>
          )}
          <button
            onClick={() => setFollow((f) => !f)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all ${
              follow
                ? "border-amber-acc/50 bg-amber-acc/10 text-amber-acc"
                : "border-ink-600 text-mist-500 hover:text-mist-300"
            }`}
            title="再生中のセグメントを自動で追従表示"
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${follow ? "anim-pulse-dot bg-amber-acc" : "bg-ink-500"}`} />
            追従
          </button>
          <button
            onClick={() => setShowJson((v) => !v)}
            className={`rounded-full border px-2.5 py-1 font-tc text-[10px] transition-all ${
              showJson ? "border-teal-acc/50 bg-teal-deep/15 text-teal-acc" : "border-ink-600 text-mist-500 hover:text-mist-300"
            }`}
            title="DBに保存された segments JSON を表示"
          >
            {"{ } JSON"}
          </button>
        </div>
      </div>

      {/* JSON viewer */}
      {showJson && segmentsJson && (
        <div className="anim-fade border-b border-ink-700 bg-ink-900/80 px-4 py-3">
          <p className="mb-2 font-tc text-[10px] text-mist-500">
            transcripts.segments <span className="text-teal-acc">— SQLite に保存されている JSON 文字列</span>
          </p>
          <pre className="codeblock max-h-44 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-3">
            {JSON.stringify(JSON.parse(segmentsJson), null, 2)}
          </pre>
        </div>
      )}

      {/* list */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {status === "transcribing" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-mist-500">
            <div className="flex items-end gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="eq-bar w-1.5 rounded-sm bg-amber-acc/70" style={{ height: "100%", animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <p className="font-tc text-[12px]">faster-whisper がセグメントを生成中…</p>
          </div>
        ) : segments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-mist-600">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h10M4 18h13" strokeLinecap="round" /></svg>
            <p className="text-[13px]">字幕データがありません</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-mist-600">
            <p className="text-[13px]">「{q}」に一致する文節がありません</p>
            <p className="font-tc text-[11px]">transcript full-text search: 0 hits</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            {visible.map(({ s, i }) => {
              const active = i === activeIdx;
              const words = (s.words ?? []) as TimedToken[];
              const k = active && words.length ? spokenChars(s.text, words, time) : 0;
              return (
                <div
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  onClick={() => onSeek(s.start)}
                  className={`group flex cursor-pointer items-start gap-3 rounded-md border-l-2 px-3 py-[7px] transition-all duration-150 ${
                    active
                      ? inGap
                        ? "border-ink-500 bg-ink-800/70"
                        : "border-amber-acc bg-ink-750 shadow-[inset_0_0_0_1px_rgba(242,163,60,0.12)]"
                      : "border-transparent hover:translate-x-0.5 hover:border-ink-500 hover:bg-ink-800/60"
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(s.start);
                    }}
                    className={`mt-[1px] shrink-0 rounded px-1.5 py-0.5 font-tc text-[11.5px] tabular-nums transition-colors ${
                      active
                        ? inGap
                          ? "bg-ink-700 text-mist-400"
                          : "bg-amber-acc text-ink-950"
                        : "bg-ink-800 text-mist-500 group-hover:text-amber-acc"
                    }`}
                    title={`${fmtTime(s.start, true)} へジャンプ`}
                  >
                    {fmtTime(s.start)}
                  </button>
                  <p
                    className={`flex-1 text-[14.5px] leading-relaxed transition-colors ${
                      active ? (inGap ? "text-mist-300" : "text-mist-100") : "text-mist-400 group-hover:text-mist-200"
                    }`}
                  >
                    {q ? (
                      <Highlight text={s.text} q={q} />
                    ) : k > 0 ? (
                      <>
                        <span className="text-amber-soft">{s.text.slice(0, k)}</span>
                        <span>{s.text.slice(k)}</span>
                      </>
                    ) : (
                      s.text
                    )}
                  </p>
                  <span className="mt-1.5 flex h-3 shrink-0 items-end gap-[2px]">
                    {active && !inGap ? (
                      playing ? (
                        [0, 1, 2].map((b) => (
                          <span key={b} className="eq-bar w-[2.5px] rounded-[1px] bg-amber-acc" style={{ height: "100%", animationDelay: `${b * 0.12}s` }} />
                        ))
                      ) : (
                        [0, 1, 2].map((b) => <span key={b} className="w-[2.5px] rounded-[1px] bg-amber-acc/50" style={{ height: 4 }} />)
                      )
                    ) : (
                      <span className="hidden font-tc text-[9.5px] text-mist-600 opacity-0 transition-opacity group-hover:opacity-100 sm:inline">
                        +{fmtTime(s.start, true)}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            <div className="h-6" />
          </div>
        )}
      </div>
    </div>
  );
}
