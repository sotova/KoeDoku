/* ============================================================
 * 音声合成・波形解析ユーティリティ
 * デモファイルは決定的シードから WAV を生成し、
 * HTML5 Audio で実再生・実シークできるようにする。
 * ============================================================ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, samples.length * 2, true);
  new Int16Array(buf, 44).set(samples);
  return new Blob([buf], { type: "audio/wav" });
}

/** デモ用アンビエント音声を合成（会話の“ベッド”となる音） */
export function synthesizeDemoWav(seed: number, duration: number): Blob {
  const sr = 22050;
  const n = Math.floor(sr * duration);
  const data = new Int16Array(n);
  const rnd = mulberry32(seed);
  const roots = [110, 98, 123.47, 130.81];
  const root = roots[seed % roots.length];
  const f1 = root;
  const f2 = root * (rnd() > 0.5 ? 1.25 : 1.2);
  const f3 = root * 1.5;
  const phraseLen = sr * (4.2 + rnd() * 2.6);
  const lfo1 = 0.7 + rnd() * 0.9;
  const lfo2 = 1.6 + rnd() * 1.4;
  const twoPi = Math.PI * 2;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ph = (i % phraseLen) / phraseLen;
    const env = Math.pow(Math.sin(Math.PI * ph), 1.4) * 0.8 + 0.2;
    let s = 0;
    s += Math.sin(twoPi * f1 * t + Math.sin(t * lfo1) * 0.7) * 0.5;
    s += Math.sin(twoPi * f2 * t + 0.6) * 0.3;
    s += Math.sin(twoPi * f3 * t + Math.sin(t * lfo2) * 0.4) * 0.2;
    s += Math.sin(twoPi * root * 4 * t) * 0.045 * Math.sin(t * 2.3);
    s += (rnd() - 0.5) * 0.055;
    const fade = Math.min(1, t / 1.1, (duration - t) / 1.4);
    const val = s * env * fade * 0.2;
    data[i] = Math.max(-32767, Math.min(32767, Math.round(val * 32767)));
  }
  return encodeWav(data, sr);
}

/* ---------------- decode / peaks ---------------- */

export interface Peaks {
  max: Float32Array;
  min: Float32Array;
  duration: number;
  buckets: number;
}

let decodeCtx: AudioContext | null = null;
function getDecodeCtx(): AudioContext {
  if (!decodeCtx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    decodeCtx = new AC();
  }
  return decodeCtx;
}

export async function computePeaks(blob: Blob, buckets = 720): Promise<Peaks> {
  const arr = await blob.arrayBuffer();
  const ctx = getDecodeCtx();
  const audio = await ctx.decodeAudioData(arr.slice(0));
  const ch = audio.getChannelData(0);
  const max = new Float32Array(buckets);
  const min = new Float32Array(buckets);
  const block = Math.max(1, Math.floor(ch.length / buckets));
  for (let b = 0; b < buckets; b++) {
    let mx = 0;
    let mn = 0;
    const start = b * block;
    const end = Math.min(ch.length, start + block);
    const step = Math.max(1, Math.floor((end - start) / 60));
    for (let i = start; i < end; i += step) {
      const v = ch[i];
      if (v > mx) mx = v;
      if (v < mn) mn = v;
    }
    max[b] = mx;
    min[b] = mn;
  }
  return { max, min, duration: audio.duration, buckets };
}

/* ---------------- word segmentation (karaoke) ---------------- */

export interface TimedToken {
  text: string;
  start: number;
  end: number;
}

/** セグメントテキストから word_timestamps 風の単語タイミングを生成 */
export function deriveWords(text: string, start: number, end: number): TimedToken[] {
  const tokens: { text: string; wordLike: boolean }[] = [];
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment(s: string): Iterable<{ segment: string; isWordLike?: boolean }> } }).Segmenter;
    if (Seg) {
      const seg = new Seg("ja", { granularity: "word" });
      for (const p of seg.segment(text)) tokens.push({ text: p.segment, wordLike: !!p.isWordLike });
    }
  } catch {
    /* fallback below */
  }
  if (tokens.length === 0) {
    for (let i = 0; i < text.length; i += 2) tokens.push({ text: text.slice(i, i + 2), wordLike: true });
  }
  const wordLen = tokens.reduce((a, t) => a + (t.wordLike ? t.text.length : 0), 0) || 1;
  const dur = Math.max(0.01, end - start);
  let t = start;
  return tokens.map((tk) => {
    const d = tk.wordLike ? dur * (tk.text.length / wordLen) : 0;
    const tok = { text: tk.text, start: +t.toFixed(3), end: +(t + d).toFixed(3) };
    t += d;
    return tok;
  });
}

/** 再生位置までに読み上げられた文字数を返す（カラオケハイライト用） */
export function spokenChars(text: string, words: TimedToken[], t: number): number {
  let from = 0;
  let k = 0;
  for (const w of words) {
    if (w.start > t) break;
    const idx = text.indexOf(w.text, from);
    if (idx >= 0) {
      k = idx + w.text.length;
      from = k;
    }
  }
  return k;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
