import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArchitectureModal from "./components/ArchitectureModal";
import JobPanel from "./components/JobPanel";
import PlayerBar from "./components/PlayerBar";
import Sidebar from "./components/Sidebar";
import SubtitleList from "./components/SubtitleList";
import Waveform from "./components/Waveform";
import { computePeaks, deriveWords, hashStr, synthesizeDemoWav, type Peaks } from "./lib/audio";
import { clearDB, idbClearAll, idbDel, idbGet, idbPut, loadDB, saveDB } from "./lib/db";
import { DEMO_FILES } from "./lib/demoData";
import { generateSegmentsFor, runTranscriptionJob, withWords } from "./lib/transcribe";
import { exportPortableZip } from "./lib/zipExport";
import { usePlayer } from "./hooks/usePlayer";
import { fmtTime, uid, type DBShape, type FileRec, type JobState, type Segment, type ToastMsg } from "./lib/types";

/* ---------------- seed ---------------- */

function buildSeedDB(): DBShape {
  const now = Date.now();
  const files: FileRec[] = [];
  const transcripts: DBShape["transcripts"] = [];
  for (const d of DEMO_FILES) {
    const segs = withWords(d.segments);
    const duration = +(segs[segs.length - 1].end + 2.6).toFixed(2);
    const createdAt = now - d.createdDaysAgo * 86400000 - (d.seed % 9) * 3600000;
    files.push({
      id: d.id,
      name: d.name,
      path: d.path,
      kind: "demo",
      seed: d.seed,
      duration,
      sizeKB: Math.round((duration * 22050 * 2) / 1024),
      tags: [...d.tags],
      createdAt,
      model: "large-v3",
      lang: "ja",
    });
    transcripts.push({
      fileId: d.id,
      model: "large-v3",
      engine: "faster-whisper 1.1.0",
      language: "ja",
      segmentsJson: JSON.stringify(segs),
      createdAt: createdAt + 12 * 60000,
    });
  }
  return { files, transcripts };
}

const urlCache = new Map<string, string>();
const peakCache = new Map<string, Peaks>();

export default function App() {
  const [db, setDb] = useState<DBShape>(() => loadDB() ?? buildSeedDB());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeJob, setActiveJob] = useState<JobState | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [archOpen, setArchOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);

  const dbRef = useRef(db);
  dbRef.current = db;
  const queueRef = useRef<{ file: FileRec; segments: Segment[] }[]>([]);
  const jobSignalRef = useRef<{ cancelled: boolean } | null>(null);
  const activeJobRef = useRef<JobState | null>(null);
  activeJobRef.current = activeJob;
  const resolveToken = useRef(0);
  const seededRef = useRef(false);

  /* persist */
  useEffect(() => saveDB(db), [db]);

  /* initial selection safety */
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      if (!selectedId && dbRef.current.files.length) setSelectedId(dbRef.current.files[0].id);
    }
  }, [selectedId]);

  const pushToast = useCallback((kind: ToastMsg["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  /* ---------- portable ZIP export ---------- */
  const handleExportZip = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    pushToast("info", "パッケージ中…（index.html + assets + ランチャー）");
    try {
      const res = await exportPortableZip();
      pushToast("ok", `${res.name} を保存しました（${res.fileCount}ファイル / ${(res.bytes / 1024 / 1024).toFixed(1)} MB）— 解凍後 start.bat をダブルクリックで起動`);
    } catch (e) {
      console.error(e);
      pushToast("err", "ZIPの作成に失敗しました。リロードしてお試しください。");
    } finally {
      setExporting(false);
    }
  }, [exporting, pushToast]);

  /* ---------- audio resolution ---------- */
  useEffect(() => {
    setPeaks(null);
    const id = selectedId;
    if (!id) {
      setUrl(null);
      return;
    }
    const file = dbRef.current.files.find((f) => f.id === id);
    if (!file) {
      setUrl(null);
      return;
    }
    const token = ++resolveToken.current;
    void (async () => {
      const blob = file.kind === "demo" ? synthesizeDemoWav(file.seed, file.duration) : await idbGet(id);
      if (token !== resolveToken.current) return;
      if (!blob) {
        pushToast("err", "音声データが見つかりません（IndexedDB）");
        setUrl(null);
        return;
      }
      let u = urlCache.get(id);
      if (!u) {
        u = URL.createObjectURL(blob);
        urlCache.set(id, u);
      }
      setUrl(u);
      const cached = peakCache.get(id);
      if (cached) {
        setPeaks(cached);
      } else {
        try {
          const p = await computePeaks(blob);
          if (token !== resolveToken.current) return;
          peakCache.set(id, p);
          setPeaks(p);
        } catch {
          /* waveform optional */
        }
      }
    })();
  }, [selectedId, pushToast]);

  const { st, toggle, seek, seekAndPlay, skip, setRate } = usePlayer(url);

  /* ---------- job queue ---------- */
  const processQueue = useCallback(() => {
    if (activeJobRef.current || queueRef.current.length === 0) return;
    const { file, segments } = queueRef.current.shift()!;
    const signal = { cancelled: false };
    jobSignalRef.current = signal;
    void runTranscriptionJob(file.id, file.name, segments, (j) => setActiveJob(j), signal)
      .then((tr) => {
        setDb((d) => ({ ...d, transcripts: [...d.transcripts, tr] }));
        setActiveJob(null);
        setSelectedId(file.id);
        pushToast("ok", `文字起こし完了 — ${file.name}（${segments.length} セグメント）`);
        processQueue();
      })
      .catch(() => {
        setDb((d) => ({ files: d.files.filter((f) => f.id !== file.id), transcripts: d.transcripts }));
        void idbDel(file.id);
        setActiveJob(null);
        pushToast("info", "文字起こしジョブをキャンセルしました");
        processQueue();
      });
  }, [pushToast]);

  const enqueueJob = useCallback(
    (file: FileRec) => {
      const segments = generateSegmentsFor(file.name, file.duration).map((s) => ({
        ...s,
        words: s.words ?? deriveWords(s.text, s.start, s.end),
      }));
      queueRef.current.push({ file, segments });
      processQueue();
    },
    [processQueue]
  );

  /* ---------- import ---------- */
  const importFiles = useCallback(
    async (list: FileList) => {
      for (const f of Array.from(list)) {
        try {
          const p = await computePeaks(f);
          const id = uid();
          await idbPut(id, f);
          const rec: FileRec = {
            id,
            name: f.name,
            path: `C:\\VoiceDB\\inbox\\${f.name}`,
            kind: "local",
            seed: hashStr(f.name),
            duration: +p.duration.toFixed(2),
            sizeKB: Math.max(1, Math.round(f.size / 1024)),
            tags: ["取込"],
            createdAt: Date.now(),
            model: "large-v3",
            lang: "ja",
          };
          peakCache.set(id, p);
          setDb((d) => ({ ...d, files: [rec, ...d.files] }));
          enqueueJob(rec);
          pushToast("info", `キューに追加: ${f.name}`);
        } catch {
          pushToast("err", `読み込めませんでした: ${f.name}`);
        }
      }
    },
    [enqueueJob, pushToast]
  );

  /* ---------- demo / reset / delete ---------- */
  const addDemo = useCallback(() => {
    const missing = DEMO_FILES.filter((d) => !dbRef.current.files.some((f) => f.id === d.id));
    if (missing.length === 0) {
      pushToast("info", "デモデータはすべて登録済みです");
      return;
    }
    const seed = buildSeedDB();
    const files = seed.files.filter((f) => missing.some((m) => m.id === f.id));
    const trs = seed.transcripts.filter((t) => missing.some((m) => m.id === t.fileId));
    setDb((d) => ({ files: [...files, ...d.files], transcripts: [...trs, ...d.transcripts] }));
    setSelectedId(files[0]?.id ?? null);
    pushToast("ok", `デモデータを ${files.length} 件追加しました`);
  }, [pushToast]);

  const resetAll = useCallback(async () => {
    jobSignalRef.current && (jobSignalRef.current.cancelled = true);
    queueRef.current = [];
    resolveToken.current++;
    urlCache.forEach((u) => URL.revokeObjectURL(u));
    urlCache.clear();
    peakCache.clear();
    clearDB();
    await idbClearAll();
    const seed = buildSeedDB();
    setDb(seed);
    setSelectedId(seed.files[0].id);
    setActiveJob(null);
    pushToast("ok", "DBを初期化し、デモデータを再投入しました");
  }, [pushToast]);

  const deleteFile = useCallback(
    (id: string) => {
      const f = dbRef.current.files.find((x) => x.id === id);
      setDb((d) => ({
        files: d.files.filter((x) => x.id !== id),
        transcripts: d.transcripts.filter((t) => t.fileId !== id),
      }));
      void idbDel(id);
      const u = urlCache.get(id);
      if (u) {
        URL.revokeObjectURL(u);
        urlCache.delete(id);
      }
      peakCache.delete(id);
      setSelectedId((cur) => {
        if (cur !== id) return cur;
        const rest = dbRef.current.files.filter((x) => x.id !== id);
        return rest[0]?.id ?? null;
      });
      pushToast("info", `削除しました: ${f?.name ?? id}`);
    },
    [pushToast]
  );

  /* ---------- tags ---------- */
  const addTag = useCallback((id: string, tag: string) => {
    setDb((d) => ({
      ...d,
      files: d.files.map((f) => (f.id === id && !f.tags.includes(tag) ? { ...f, tags: [...f.tags, tag] } : f)),
    }));
  }, []);
  const removeTag = useCallback((id: string, tag: string) => {
    setDb((d) => ({
      ...d,
      files: d.files.map((f) => (f.id === id ? { ...f, tags: f.tags.filter((t) => t !== tag) } : f)),
    }));
  }, []);

  /* ---------- derived ---------- */
  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of db.files) for (const t of f.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }, [db.files]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.files.filter((f) => {
      if (activeTags.length && !activeTags.every((t) => f.tags.includes(t))) return false;
      if (!q) return true;
      if (f.name.toLowerCase().includes(q)) return true;
      const tr = db.transcripts.find((t) => t.fileId === f.id);
      return !!tr && tr.segmentsJson.toLowerCase().includes(q);
    });
  }, [db, query, activeTags]);

  const selected = db.files.find((f) => f.id === selectedId) ?? null;
  const selectedTr = db.transcripts.find((t) => t.fileId === selectedId) ?? null;
  const segments = useMemo<Segment[]>(() => {
    if (!selectedTr) return [];
    try {
      return JSON.parse(selectedTr.segmentsJson) as Segment[];
    } catch {
      return [];
    }
  }, [selectedTr]);
  const markers = useMemo(() => segments.map((s) => s.start), [segments]);
  const jobFileIds = useMemo(() => new Set(activeJob ? [activeJob.fileId] : []), [activeJob]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft") {
        skip(-5);
      } else if (e.key === "ArrowRight") {
        skip(5);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip]);

  const cancelJob = useCallback(() => {
    if (jobSignalRef.current) jobSignalRef.current.cancelled = true;
  }, []);

  const waveDuration = st.duration > 0 ? st.duration : selected?.duration ?? 0;

  return (
    <div className="bg-studio relative h-screen w-full overflow-hidden text-mist-100">
      <div className="bg-gridlines pointer-events-none absolute inset-0" />
      <div className="bg-noise pointer-events-none absolute inset-0 opacity-70" />

      <div className="relative z-10 grid h-full w-full grid-cols-1 md:grid-cols-[324px_minmax(0,1fr)]">
        {/* left */}
        <div className="hidden h-full md:block">
          <Sidebar
            files={filtered}
            totalCount={db.files.length}
            allTags={allTags}
            activeTags={activeTags}
            onToggleTag={(t) => setActiveTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={deleteFile}
            query={query}
            onQuery={setQuery}
            jobFileIds={jobFileIds}
            onImport={(fl) => void importFiles(fl)}
            onAddDemo={addDemo}
            onReset={() => void resetAll()}
            onAddTag={addTag}
            onRemoveTag={removeTag}
          />
        </div>

        {/* right */}
        <main className="flex h-full min-w-0 flex-col">
          {/* header */}
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-900/80 px-4">
            <div className="flex min-w-0 items-center gap-1.5 font-tc text-[11px] text-mist-600">
              <span>files</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
              <span className="truncate text-mist-300">{selected ? selected.name : "—"}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-teal-deep/50 bg-teal-deep/10 px-2.5 py-1 font-tc text-[9.5px] text-teal-acc sm:inline-flex">
                <span className="anim-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-teal-acc" />
                CUDA · RTX 3050
              </span>
              <span className="hidden items-center gap-1.5 rounded-full border border-ink-600 px-2.5 py-1 font-tc text-[9.5px] text-mist-500 lg:inline-flex">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /></svg>
                db.sqlite3 · {db.files.length} files · {db.transcripts.length} transcripts
              </span>
              <span className="hidden rounded-full border border-amber-acc/40 bg-amber-acc/10 px-2.5 py-1 font-tc text-[9.5px] text-amber-acc xl:inline-block">
                browser prototype
              </span>
              <button
                onClick={handleExportZip}
                disabled={exporting}
                title="ポータブル版をZIPに打包（解凍後 start.bat ダブルクリックで起動）"
                className="flex items-center gap-1.5 rounded-full border border-teal-deep/60 bg-teal-deep/10 px-3 py-1 text-[11px] font-bold text-teal-acc transition-all hover:bg-teal-deep/25 active:scale-95 disabled:cursor-wait disabled:opacity-60"
              >
                {exporting ? (
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 019 9" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                )}
                {exporting ? "打包中…" : "ZIP書出"}
              </button>
              <button
                onClick={() => setArchOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-ink-600 px-3 py-1 text-[11px] font-bold text-mist-300 transition-all hover:border-amber-acc/50 hover:text-amber-acc active:scale-95"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19V5a2 2 0 012-2h13v18H6a2 2 0 01-2-2zm0 0a2 2 0 012-2h13" />
                </svg>
                実装アーキテクチャ
              </button>
            </div>
          </header>

          {/* player */}
          <section className="shrink-0 border-b border-ink-700 bg-ink-850/60 px-4 pb-4 pt-3">
            <div className="mb-2.5 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-acc/30 bg-amber-acc/10 text-amber-acc">
                {st.playing ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="11" y="7" width="4" height="10" rx="1" /><rect x="17" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V6l10-2v11" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="15" r="2.5" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[15px] font-black tracking-wide text-mist-100">
                  {selected ? selected.name : "ファイルが選択されていません"}
                </h1>
                <p className="truncate font-tc text-[9.5px] text-mist-600">
                  {selected
                    ? `${selected.path} · ${selected.sizeKB.toLocaleString()} KB · lang=${selected.lang} · ${fmtTime(selected.duration)}`
                    : "左のリストからファイルを選択してください"}
                </p>
              </div>
              {selected && selected.tags.length > 0 && (
                <div className="hidden shrink-0 flex-wrap justify-end gap-1 md:flex">
                  {selected.tags.map((t) => (
                    <span key={t} className="rounded border border-teal-deep/40 bg-teal-deep/10 px-1.5 py-0.5 text-[10px] text-teal-acc/90">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Waveform peaks={peaks} duration={waveDuration} time={st.time} markers={markers} onSeek={seek} />

            <div className="mt-3">
              <PlayerBar
                playing={st.playing}
                ready={st.ready}
                time={st.time}
                duration={st.duration > 0 ? st.duration : waveDuration}
                rate={st.rate}
                vu={st.vu}
                onToggle={toggle}
                onSkip={skip}
                onRate={setRate}
              />
            </div>
          </section>

          {/* subtitles */}
          <SubtitleList
            segments={segments}
            time={st.time}
            playing={st.playing}
            onSeek={seekAndPlay}
            query={query}
            segmentsJson={selectedTr?.segmentsJson ?? null}
            meta={selectedTr ? { model: selectedTr.model, engine: selectedTr.engine } : null}
            status={selected && !selectedTr && activeJob?.fileId === selected.id ? "transcribing" : "ready"}
          />
        </main>
      </div>

      {/* mobile notice */}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-ink-950 px-8 text-center md:hidden">
        <svg width="40" height="40" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#161f2a" stroke="#2b3c50" /><g fill="#f2a33c"><rect x="6" y="12" width="3" height="8" rx="1.5" /><rect x="11" y="7" width="3" height="18" rx="1.5" /><rect x="16" y="10" width="3" height="12" rx="1.5" /><rect x="21" y="4" width="3" height="24" rx="1.5" /></g></svg>
        <p className="font-display text-lg font-bold text-mist-100">声読 KoeDoku</p>
        <p className="text-[12.5px] leading-relaxed text-mist-500">
          デスクトップ向け2カラムUIのため、
          <br />
          幅 768px 以上のウィンドウで開いてください。
        </p>
      </div>

      {activeJob && <JobPanel job={activeJob} onCancel={cancelJob} />}
      <ArchitectureModal open={archOpen} onClose={() => setArchOpen(false)} />

      {/* toasts */}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[320px] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`anim-toast pointer-events-auto flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] font-bold shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur ${
              t.kind === "ok"
                ? "border-teal-deep/60 bg-ink-850/95 text-teal-acc"
                : t.kind === "err"
                ? "border-coral-acc/50 bg-ink-850/95 text-coral-acc"
                : "border-ink-600 bg-ink-850/95 text-mist-200"
            }`}
          >
            {t.kind === "ok" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
            ) : t.kind === "err" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 8v5m0 3.5v.5" /><circle cx="12" cy="12" r="9" strokeWidth="2" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
            )}
            <span className="flex-1 leading-snug">{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
