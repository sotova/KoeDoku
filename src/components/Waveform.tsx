/* ============================================================
 * 波形タイムライン — 動画編集ソフトのタイムライン風
 * クリック/ドラッグでシーク、セグメント開始位置にマーカー
 * ============================================================ */
import { useEffect, useRef, useState } from "react";
import type { Peaks } from "../lib/audio";
import { fmtTime } from "../lib/types";

interface Props {
  peaks: Peaks | null;
  duration: number;
  time: number;
  markers: number[];
  onSeek: (t: number) => void;
}

const WAVE_H = 104;
const RULER_H = 20;
const TOTAL_H = WAVE_H + RULER_H;

function pickStep(dur: number): number {
  if (dur <= 45) return 5;
  if (dur <= 120) return 15;
  if (dur <= 300) return 30;
  return 60;
}

export default function Waveform({ peaks, duration, time, markers, onSeek }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setWidth(Math.max(0, Math.round(es[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 波形オフスクリーン描画 */
  useEffect(() => {
    if (!peaks || width <= 0) {
      baseRef.current = null;
      activeRef.current = null;
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = width * dpr;
      c.height = TOTAL_H * dpr;
      return c;
    };
    const base = mk();
    const active = mk();

    const drawWave = (ctx: CanvasRenderingContext2D, top: string, bottom: string, ruler: string) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mid = WAVE_H / 2;
      const amp = mid - 8;
      ctx.fillStyle = "rgba(124,143,163,0.12)";
      ctx.fillRect(0, mid - 0.5, width, 1);
      const bw = width / peaks.buckets;
      for (let i = 0; i < peaks.buckets; i++) {
        const x = i * bw;
        const h1 = Math.max(1.2, peaks.max[i] * amp);
        const h2 = Math.max(1.2, -peaks.min[i] * amp * 0.9);
        ctx.fillStyle = top;
        ctx.fillRect(x, mid - h1, Math.max(0.8, bw - 0.6), h1);
        ctx.fillStyle = bottom;
        ctx.fillRect(x, mid, Math.max(0.8, bw - 0.6), h2);
      }
      // ruler
      const step = pickStep(duration);
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.textBaseline = "middle";
      for (let t = 0; t <= duration; t += step) {
        const x = (t / duration) * width;
        ctx.fillStyle = "rgba(124,143,163,0.4)";
        ctx.fillRect(x, WAVE_H, 1, 5);
        ctx.fillStyle = ruler;
        ctx.fillText(fmtTime(t), x + 4, WAVE_H + 12);
      }
      // segment markers
      for (const m of markers) {
        const x = (m / duration) * width;
        ctx.fillStyle = "rgba(59,200,180,0.75)";
        ctx.fillRect(x, WAVE_H + 1, 1.5, 6);
      }
    };

    drawWave(base.getContext("2d")!, "#3d526b", "#31445c", "#546a82");
    drawWave(active.getContext("2d")!, "#f2a33c", "#d18a2b", "#546a82");
    baseRef.current = base;
    activeRef.current = active;
  }, [peaks, width, duration, markers]);

  /* フレーム合成 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== width * dpr || canvas.height !== TOTAL_H * dpr) {
      canvas.width = width * dpr;
      canvas.height = TOTAL_H * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, TOTAL_H);
    const dur = duration || 1;
    const x = Math.min(width, (time / dur) * width);

    if (baseRef.current && activeRef.current) {
      ctx.drawImage(baseRef.current, 0, 0, width, TOTAL_H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, x, TOTAL_H);
      ctx.clip();
      ctx.drawImage(activeRef.current, 0, 0, width, TOTAL_H);
      ctx.restore();
    } else {
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "#546a82";
      ctx.textAlign = "center";
      ctx.fillText("waveform decoding …", width / 2, WAVE_H / 2);
      ctx.textAlign = "left";
    }

    // hover line
    if (hover) {
      ctx.fillStyle = "rgba(169,186,203,0.35)";
      ctx.fillRect(hover.x, 0, 1, WAVE_H);
    }
    // playhead
    if (peaks) {
      ctx.fillStyle = "#f2a33c";
      ctx.fillRect(x - 0.75, 0, 1.5, WAVE_H);
      ctx.beginPath();
      ctx.moveTo(x - 4, 0);
      ctx.lineTo(x + 4, 0);
      ctx.lineTo(x, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(242,163,60,0.18)";
      ctx.fillRect(x - 4, 0, 8, WAVE_H);
    }
  }, [time, width, duration, peaks, hover]);

  const posToTime = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * (duration || 0);
  };

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height: TOTAL_H }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-crosshair touch-none"
        onPointerDown={(e) => {
          if (!duration) return;
          draggingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          onSeek(posToTime(e.clientX));
        }}
        onPointerMove={(e) => {
          const t = posToTime(e.clientX);
          const rect = canvasRef.current!.getBoundingClientRect();
          setHover({ x: e.clientX - rect.left, t });
          if (draggingRef.current && duration) onSeek(t);
        }}
        onPointerUp={() => (draggingRef.current = false)}
        onPointerLeave={() => {
          setHover(null);
          draggingRef.current = false;
        }}
      />
      {hover && duration > 0 && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded border border-ink-600 bg-ink-900/95 px-1.5 py-0.5 font-tc text-[10px] text-mist-200"
          style={{ left: Math.max(24, Math.min(width - 24, hover.x)) }}
        >
          {fmtTime(hover.t, true)}
        </div>
      )}
    </div>
  );
}
