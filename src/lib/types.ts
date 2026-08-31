export interface WordSeg {
  start: number;
  end: number;
  text: string;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  words?: WordSeg[];
}

export interface FileRec {
  id: string;
  name: string;
  path: string;
  kind: "demo" | "local";
  seed: number;
  duration: number;
  sizeKB: number;
  tags: string[];
  createdAt: number;
  model: string;
  lang: string;
}

export interface TranscriptRec {
  fileId: string;
  model: string;
  engine: string;
  language: string;
  /** 実DBと同様に JSON 文字列のまま保持する */
  segmentsJson: string;
  createdAt: number;
}

export interface DBShape {
  files: FileRec[];
  transcripts: TranscriptRec[];
}

export type JobPhase = "load" | "vad" | "encode" | "write" | "done";

export interface JobState {
  fileId: string;
  fileName: string;
  phase: JobPhase;
  stepIndex: number;
  progress: number; // 0..100 (encode phase)
  gpu: number; // 0..100
  segCount: number;
  totalSegs: number;
  startedAt: number;
}

export interface ToastMsg {
  id: number;
  kind: "ok" | "err" | "info";
  text: string;
}

/* ---------------- time helpers ---------------- */

export function fmtTime(sec: number, withTenth = false): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const base = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (!withTenth) return base;
  const t = Math.floor((sec % 1) * 10);
  return `${base}.${t}`;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
