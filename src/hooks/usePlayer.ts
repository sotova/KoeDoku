/* ============================================================
 * 再生エンジン — HTML5 Audio を Web Audio API 経由で制御
 * 字幕リスト(外部)からの currentTime シークを完全サポート
 * ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";

let sharedAudio: HTMLAudioElement | null = null;
let sharedCtx: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let wired = false;

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

/** 再生開始(ユーザー操作)のタイミングで解析ノードを接続 */
function ensureGraph() {
  if (wired) return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new AC();
    sharedAnalyser = sharedCtx.createAnalyser();
    sharedAnalyser.fftSize = 256;
    const src = sharedCtx.createMediaElementSource(getAudio());
    src.connect(sharedAnalyser);
    sharedAnalyser.connect(sharedCtx.destination);
    wired = true;
  } catch {
    /* グラフ構築不能でも直接再生は動作 */
  }
}

export interface PlayerState {
  playing: boolean;
  time: number;
  duration: number;
  rate: number;
  vu: number;
  ready: boolean;
}

export function usePlayer(src: string | null) {
  const audio = getAudio();
  const [st, setSt] = useState<PlayerState>({
    playing: false,
    time: 0,
    duration: 0,
    rate: 1,
    vu: 0,
    ready: false,
  });
  const vuRef = useRef(0);
  const bufRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef(0);

  // src 切替
  useEffect(() => {
    audio.pause();
    if (src) {
      audio.src = src;
      audio.load();
    } else {
      audio.removeAttribute("src");
    }
    vuRef.current = 0;
    setSt((s) => ({ ...s, playing: false, time: 0, duration: 0, vu: 0, ready: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // イベント購読 + rAF ループ
  useEffect(() => {
    const onPlay = () => setSt((s) => ({ ...s, playing: true }));
    const onPause = () => setSt((s) => ({ ...s, playing: false }));
    const onMeta = () =>
      setSt((s) => ({ ...s, duration: audio.duration || 0, ready: !Number.isNaN(audio.duration) }));
    const onTime = () => setSt((s) => ({ ...s, time: audio.currentTime }));
    const onEnded = () => setSt((s) => ({ ...s, playing: false }));
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      // 高頻度 time 反映(timeupdate は 4Hz のため)
      setSt((s) => (Math.abs(s.time - audio.currentTime) > 0.02 ? { ...s, time: audio.currentTime } : s));
      // VU
      if (sharedAnalyser && !audio.paused) {
        if (!bufRef.current) bufRef.current = new Uint8Array(sharedAnalyser.frequencyBinCount);
        sharedAnalyser.getByteTimeDomainData(bufRef.current as Uint8Array<ArrayBuffer>);
        let sum = 0;
        const b = bufRef.current;
        for (let i = 0; i < b.length; i++) {
          const v = (b[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / b.length);
        const target = Math.min(1, rms * 3.2);
        vuRef.current = target > vuRef.current ? target : vuRef.current * 0.88 + target * 0.12;
        setSt((s) => (Math.abs(s.vu - vuRef.current) > 0.015 ? { ...s, vu: vuRef.current } : s));
      } else if (vuRef.current > 0.01) {
        vuRef.current *= 0.86;
        setSt((s) => ({ ...s, vu: vuRef.current }));
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(() => {
    ensureGraph();
    if (sharedCtx && sharedCtx.state === "suspended") void sharedCtx.resume();
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [audio]);

  const seek = useCallback(
    (t: number) => {
      const d = audio.duration || 0;
      audio.currentTime = Math.max(0, Math.min(t, d > 0 ? Math.max(0, d - 0.05) : t));
      setSt((s) => ({ ...s, time: audio.currentTime }));
    },
    [audio]
  );

  /** 字幕クリック: シーク + 再生開始 */
  const seekAndPlay = useCallback(
    (t: number) => {
      ensureGraph();
      if (sharedCtx && sharedCtx.state === "suspended") void sharedCtx.resume();
      seek(t);
      void audio.play().catch(() => undefined);
    },
    [audio, seek]
  );

  const skip = useCallback((d: number) => seek(audio.currentTime + d), [audio, seek]);

  const setRate = useCallback(
    (r: number) => {
      audio.playbackRate = r;
      setSt((s) => ({ ...s, rate: r }));
    },
    [audio]
  );

  return { st, toggle, seek, seekAndPlay, skip, setRate };
}
