import { fmtTime } from "../lib/types";

interface Props {
  playing: boolean;
  ready: boolean;
  time: number;
  duration: number;
  rate: number;
  vu: number;
  onToggle: () => void;
  onSkip: (d: number) => void;
  onRate: (r: number) => void;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

const VU_BARS = [0.5, 0.9, 0.65, 1, 0.8, 0.55, 0.95, 0.7, 0.45, 0.85, 0.6, 1, 0.75, 0.5];

export default function PlayerBar({ playing, ready, time, duration, rate, vu, onToggle, onSkip, onRate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {/* transport */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSkip(-5)}
          disabled={!ready}
          title="5秒戻る (←)"
          className="grid h-9 w-9 place-items-center rounded-full border border-ink-600 text-mist-300 transition-all hover:border-amber-acc/60 hover:text-amber-acc active:scale-90 disabled:opacity-30"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 19l-7-7 7-7" />
            <path d="M20 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={onToggle}
          disabled={!ready}
          title="再生 / 一時停止 (Space)"
          className="group relative grid h-13 w-13 place-items-center rounded-full bg-amber-acc text-ink-950 shadow-[0_0_0_5px_rgba(242,163,60,0.12),0_6px_22px_rgba(242,163,60,0.35)] transition-all hover:brightness-110 active:scale-90 disabled:opacity-40 disabled:shadow-none"
          style={{ height: 52, width: 52 }}
        >
          {playing && (
            <span className="anim-pulse-dot absolute inset-0 rounded-full border-2 border-amber-acc/50" />
          )}
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4.5" height="14" rx="1" />
              <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13a1 1 0 001.52.86l10.2-6.5a1 1 0 000-1.7L9.52 4.64A1 1 0 008 5.5z" />
            </svg>
          )}
        </button>

        <button
          onClick={() => onSkip(5)}
          disabled={!ready}
          title="5秒進む (→)"
          className="grid h-9 w-9 place-items-center rounded-full border border-ink-600 text-mist-300 transition-all hover:border-amber-acc/60 hover:text-amber-acc active:scale-90 disabled:opacity-30"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 5l7 7-7 7" />
            <path d="M4 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* timecode */}
      <div className="flex items-baseline gap-2 font-tc">
        <span className={`text-[22px] font-semibold tabular-nums ${playing ? "text-amber-acc" : "text-mist-100"}`}>
          {fmtTime(time, true)}
        </span>
        <span className="text-[13px] tabular-nums text-mist-500">/ {fmtTime(duration, true)}</span>
      </div>

      {/* rate */}
      <div className="flex items-center rounded-full border border-ink-600 bg-ink-900 p-0.5">
        {RATES.map((r) => (
          <button
            key={r}
            onClick={() => onRate(r)}
            className={`rounded-full px-2.5 py-1 font-tc text-[11px] transition-all ${
              rate === r
                ? "bg-ink-600 text-amber-acc shadow-inner"
                : "text-mist-500 hover:text-mist-200"
            }`}
          >
            {r}×
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-4">
        {/* EQ indicator */}
        <div className="flex h-5 items-end gap-[3px]" title={playing ? "再生中" : "停止中"}>
          {playing ? (
            [0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="eq-bar w-[3px] rounded-sm bg-teal-acc" style={{ height: "60%" }} />
            ))
          ) : (
            [0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="w-[3px] rounded-sm bg-ink-600" style={{ height: 5 }} />
            ))
          )}
        </div>

        {/* VU meter */}
        <div className="hidden items-end gap-[2.5px] sm:flex" title="レベルメーター">
          {VU_BARS.map((f, i) => {
            const level = Math.max(0.06, vu * f * 1.15);
            const hot = level > 0.82;
            return (
              <span
                key={i}
                className="w-[4px] rounded-[1px] transition-[height,background-color] duration-75"
                style={{
                  height: `${8 + level * 18}px`,
                  backgroundColor: hot ? "#e4604e" : level > 0.5 ? "#f2a33c" : "#3bc8b4",
                  opacity: playing || vu > 0.05 ? 1 : 0.35,
                }}
              />
            );
          })}
        </div>

        {/* shortcut hints */}
        <div className="hidden items-center gap-1.5 lg:flex">
          <kbd>Space</kbd>
          <span className="text-[10px] text-mist-600">再生</span>
          <kbd>← →</kbd>
          <span className="text-[10px] text-mist-600">±5秒</span>
        </div>
      </div>
    </div>
  );
}
