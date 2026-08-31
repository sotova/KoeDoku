import { JOB_STEPS } from "../lib/transcribe";
import type { JobState } from "../lib/types";

interface Props {
  job: JobState;
  onCancel: () => void;
}

const GPU_CELLS = [0.8, 1, 0.6, 0.9, 1, 0.7, 0.95, 0.85, 0.65, 1, 0.75, 0.9, 0.8, 1, 0.6, 0.95];

export default function JobPanel({ job, onCancel }: Props) {
  const encoding = job.phase === "encode";
  return (
    <div className="anim-rise fixed bottom-4 right-4 z-40 w-[330px] overflow-hidden rounded-xl border border-ink-600 bg-ink-850/95 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur">
      <div className="flex items-center gap-2 border-b border-ink-700 bg-ink-800 px-3.5 py-2.5">
        <span className="anim-blink inline-block h-2 w-2 rounded-full bg-coral-acc" />
        <span className="font-display text-[13px] font-bold text-mist-100">文字起こしジョブ</span>
        <span className="ml-auto font-tc text-[9.5px] text-mist-600">faster-whisper · CUDA</span>
      </div>

      <div className="px-3.5 py-3">
        <p className="truncate font-tc text-[11px] text-amber-acc">{job.fileName}</p>

        {/* steps */}
        <div className="mt-2.5 space-y-1.5">
          {JOB_STEPS.map((label, i) => {
            const done = job.stepIndex > i || job.phase === "done";
            const active = job.stepIndex === i && job.phase !== "done";
            return (
              <div key={label} className="flex items-center gap-2">
                {done ? (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-teal-deep/30 text-teal-acc">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
                  </span>
                ) : active ? (
                  <svg className="h-4 w-4 animate-spin text-amber-acc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 019 9" /></svg>
                ) : (
                  <span className="h-4 w-4 rounded-full border border-ink-600" />
                )}
                <span className={`font-tc text-[10.5px] ${done ? "text-mist-400" : active ? "text-mist-100" : "text-mist-600"}`}>
                  {label}
                </span>
                {active && encoding && <span className="ml-auto font-tc text-[10px] tabular-nums text-amber-acc">{job.progress}%</span>}
              </div>
            );
          })}
        </div>

        {/* progress */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${encoding ? "shimmer-bar" : "bg-teal-acc"}`}
            style={{ width: `${job.phase === "done" ? 100 : encoding ? Math.max(4, job.progress) : job.phase === "write" ? 100 : 8}%` }}
          />
        </div>

        {/* gpu + segments */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex-1">
            <p className="flex items-baseline justify-between font-tc text-[9.5px] text-mist-600">
              <span>GPU-Util</span>
              <span className={`tabular-nums ${encoding ? "text-amber-acc" : "text-mist-500"}`}>{encoding ? `${job.gpu}%` : "idle"}</span>
            </p>
            <div className="mt-1 flex h-6 items-end gap-[3px]">
              {GPU_CELLS.map((f, i) => (
                <span
                  key={i}
                  className={`w-[7px] rounded-[2px] ${encoding ? "gpu-cell bg-amber-acc/80" : "bg-ink-600"}`}
                  style={{
                    height: `${(encoding ? 0.25 + 0.75 * (job.gpu / 100) : 0.18) * f * 100}%`,
                    animationDelay: `${i * 0.07}s`,
                    animationDuration: `${0.7 + (i % 4) * 0.13}s`,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="text-right">
            <p className="font-tc text-[9.5px] text-mist-600">segments</p>
            <p className="font-tc text-[15px] font-semibold tabular-nums text-teal-acc">
              {job.segCount}<span className="text-[10px] text-mist-500"> / {job.totalSegs}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-ink-700 bg-ink-800/70 px-3.5 py-2">
        <button
          onClick={onCancel}
          className="w-full rounded-md border border-ink-600 py-1.5 text-[11px] font-bold text-mist-400 transition-all hover:border-coral-acc/50 hover:text-coral-acc active:scale-[0.98]"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
