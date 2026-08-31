/* ============================================================
 * 文字起こしエンジン（faster-whisper パイプラインのブラウザ模擬）
 * 実機では以下と等価:
 *   WhisperModel("large-v3", device="cuda", compute_type="float16")
 *   model.transcribe(path, beam_size=5, vad_filter=True, word_timestamps=True)
 * ============================================================ */
import { deriveWords, hashStr } from "./audio";
import type { JobState, Segment, TranscriptRec } from "./types";

const CORPUS: string[] = [
  "それでは、本日の議題に沿って順に進めていきます。",
  "まず初めに、全体のスケジュール感について確認させてください。",
  "前回の振り返りとして、三つの課題が挙がっていました。",
  "一つ目は、現場からの報告が遅れがちだったという点です。",
  "二つ目は、ツールの操作に慣れるまで時間がかかった点です。",
  "三つ目は、成果物の共有先が分かりにくかった点です。",
  "これらに対して、それぞれ対応策を検討してきました。",
  "報告のテンプレートを統一し、所要時間を半分以下にします。",
  "操作方法については、短い動画マニュアルを用意します。",
  "共有先はフォルダ構成を見直し、一箇所に集約します。",
  "次に、数値の確認です。今月の処理件数は千百二十件でした。",
  "目標比で百パーセントを超えており、良い傾向と言えます。",
  "ただし、月末に偏る傾向があるので、平準化を検討します。",
  "現場からは、検索が速くなったという声が届いています。",
  "一方で、夜間の読み込みが重いという指摘もあります。",
  "次回までに、キャッシュの設定を見直しておきます。",
  "最後に、来月の予定について共有します。",
  "第三週にシステム更新を予定しており、停止時間は二時間です。",
  "関係者への周知は、来週の月曜までに行います。",
  "追加の議題がある方は、終了後に残っていただけますか。",
  "なければ、これで本日の会議を終わりにします。",
  "お疲れ様でした。議事録は明日の午前中に共有します。",
];

function rngFactory(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** アップロードされたローカルファイル用のセグメントを生成 */
export function generateSegmentsFor(name: string, duration: number): Segment[] {
  const rnd = rngFactory(hashStr(name) + 7);
  const segs: Segment[] = [];
  let t = 0.3 + rnd() * 0.4;
  let i = Math.floor(rnd() * CORPUS.length);
  while (t < duration - 2.2) {
    const len = Math.min(2.6 + rnd() * 3.8, duration - 0.6 - t);
    if (len < 1.4) break;
    const start = +t.toFixed(2);
    const end = +(t + len).toFixed(2);
    const text = CORPUS[i % CORPUS.length];
    segs.push({ start, end, text, words: deriveWords(text, start, end) });
    t += len + 0.15 + rnd() * 0.55;
    i++;
  }
  return segs;
}

/** デモデータ用: 単語タイミングを付与 */
export function withWords(segs: Segment[]): Segment[] {
  return segs.map((s) => ({ ...s, words: deriveWords(s.text, s.start, s.end) }));
}

/* ---------------- ジョブ実行（進捗コールバック付き） ---------------- */

export const JOB_STEPS = [
  "モデル読込 large-v3 (float16)",
  "VAD 音声区間検出",
  "GPUエンコード (CUDA / RTX 3050)",
  "SQLite へセグメント保存",
];

const sleep = (ms: number, signal?: { cancelled: boolean }) =>
  new Promise<void>((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      if (signal?.cancelled) return reject(new Error("cancelled"));
      if (performance.now() - t0 >= ms) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });

export async function runTranscriptionJob(
  fileId: string,
  fileName: string,
  segments: Segment[],
  onUpdate: (j: JobState) => void,
  signal: { cancelled: boolean }
): Promise<TranscriptRec> {
  const base: Omit<JobState, "phase" | "stepIndex" | "progress" | "gpu" | "segCount"> = {
    fileId,
    fileName,
    totalSegs: segments.length,
    startedAt: Date.now(),
  };
  const push = (phase: JobState["phase"], stepIndex: number, progress: number, gpu: number, segCount: number) =>
    onUpdate({ ...base, phase, stepIndex, progress, gpu, segCount });

  // 1) model load
  push("load", 0, 0, 24, 0);
  await sleep(950, signal);

  // 2) VAD
  push("vad", 1, 0, 41, 0);
  await sleep(650, signal);

  // 3) GPU encode
  const encodeMs = 2400 + segments.length * 110;
  const t0 = performance.now();
  while (true) {
    if (signal.cancelled) throw new Error("cancelled");
    const p = Math.min(1, (performance.now() - t0) / encodeMs);
    const gpu = 78 + Math.round(Math.sin(performance.now() / 130) * 9 + Math.random() * 6);
    push("encode", 2, Math.round(p * 100), Math.min(99, gpu), Math.floor(p * segments.length));
    if (p >= 1) break;
    await sleep(90, signal);
  }

  // 4) write to SQLite
  push("write", 3, 100, 30, segments.length);
  await sleep(420, signal);

  push("done", 3, 100, 0, segments.length);
  return {
    fileId,
    model: "large-v3",
    engine: "faster-whisper 1.1.0 (simulated)",
    language: "ja",
    segmentsJson: JSON.stringify(segments),
    createdAt: Date.now(),
  };
}
