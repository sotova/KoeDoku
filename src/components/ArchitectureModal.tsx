import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SQL = `-- koedoku.db (SQLite) -----------------------------------
CREATE TABLE files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  path        TEXT NOT NULL UNIQUE,   -- C:\\VoiceDB\\...
  name        TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',   -- JSON配列 ["会議","検証"]
  duration    REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE transcripts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  model       TEXT NOT NULL,          -- 'large-v3'
  language    TEXT,                   -- 'ja'
  segments    TEXT NOT NULL,          -- JSON: [{start,end,text,words:[...]}]
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_transcripts_file ON transcripts(file_id);`;

const PYTHON = `# transcriber.py ----------------------------------------
from faster_whisper import WhisperModel
import sqlite3, json

# RTX 3050 (VRAM 6GB) では float16 が最適
model = WhisperModel("large-v3", device="cuda", compute_type="float16")

def transcribe(path: str, con: sqlite3.Connection, file_id: int):
    segments, info = model.transcribe(
        path,
        beam_size=5,
        language="ja",
        vad_filter=True,        # 無音区間を自動スキップ
        word_timestamps=True,   # 単語単位のタイムスタンプ
    )
    rows = [{
        "start": round(s.start, 2),
        "end":   round(s.end, 2),
        "text":  s.text.strip(),
        "words": [
            {"start": round(w.start, 2),
             "end":   round(w.end, 2),
             "text":  w.word}
            for w in (s.words or [])
        ],
    } for s in segments]

    con.execute(
        "INSERT INTO transcripts(file_id, model, language, segments)"
        " VALUES (?,?,?,?)",
        (file_id, "large-v3", info.language,
         json.dumps(rows, ensure_ascii=False)),
    )
    con.commit()`;

const SEEK_JS = `<!-- 字幕クリック → シークのブリッジ (Streamlit埋込例) -->
<audio id="kd-audio" src="stream/123.wav"></audio>
<div id="kd-subs"></div>
<script>
  const a = document.getElementById("kd-audio");

  // 字幕行クリック → currentTime へジャンプして再生
  function seekTo(t) { a.currentTime = t; a.play(); }

  // Streamlit 側からのメッセージでシーク制御
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "seek") {
      a.currentTime = e.data.t;
      a.play();
    }
  });
</script>`;

const DEPLOY = `# パッケージング (ポータブルZIP配布) -------------------
# 1) 依存を同梱して単一exe化
pyinstaller --onefile --noconsole --name start app.py

# 2) ZIP構成 (展開して start.exe をダブルクリック)
KoeDoku/
├─ start.exe            # ランチャ (内蔵Pythonで起動)
├─ app.py / components/
├─ koedoku.db           # SQLite (初回起動時に自動生成)
├─ models/large-v3/     # 事前DL済みモデル (オフライン)
└─ bin/                 # cudart64_*.dll, cuBLAS 等

# 3) 起動時チェック
#    - CUDA 利用可否:  python -c "import torch; print(torch.cuda.is_available())"
#    - 初回のみ models/ を同梱フォルダから読込、以降ネット不要`;

const TABS = [
  { id: "schema", label: "DBスキーマ", code: SQL },
  { id: "engine", label: "文字起こしエンジン", code: PYTHON },
  { id: "seek", label: "シーク連携", code: SEEK_JS },
  { id: "deploy", label: "配布・起動", code: DEPLOY },
] as const;

export default function ArchitectureModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("schema");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="anim-fade fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-rise flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-600 bg-ink-850 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-amber-acc/40 bg-amber-acc/10 text-amber-acc">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
              <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
            </svg>
          </span>
          <div>
            <h2 className="font-display text-[17px] font-extrabold text-mist-100">実装アーキテクチャ</h2>
            <p className="font-tc text-[10px] text-mist-600">faster-whisper · SQLite · CUDA — 実機ビルドのリファレンス</p>
          </div>
          <button onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-mist-500 transition-colors hover:bg-ink-700 hover:text-mist-100" title="閉じる (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex gap-1 border-b border-ink-700 bg-ink-900/70 px-4 pt-2.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg border-x border-t px-3.5 py-2 text-[12px] font-bold transition-all ${
                tab === t.id
                  ? "border-ink-600 bg-ink-850 text-amber-acc"
                  : "border-transparent text-mist-500 hover:text-mist-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <pre className="codeblock rounded-xl border border-ink-700 bg-ink-950 p-4">{active.code}</pre>

          {tab === "schema" && (
            <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-mist-400">
              <li className="flex gap-2"><span className="text-teal-acc">▸</span> <b className="text-mist-200">transcripts.segments</b> は JSON 文字列のまま保存し、再生時にパースして字幕として再利用する。</li>
              <li className="flex gap-2"><span className="text-teal-acc">▸</span> <b className="text-mist-200">tags</b> は JSON 配列。本画面のタグフィルタは <code className="font-tc text-[11px] text-amber-acc">json_each(tags)</code> で検索する想定。</li>
            </ul>
          )}
          {tab === "engine" && (
            <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-mist-400">
              <li className="flex gap-2"><span className="text-teal-acc">▸</span> <b className="text-mist-200">word_timestamps=True</b> で単語タイムスタンプを取得し、カラオケ風の同期表示に利用。</li>
              <li className="flex gap-2"><span className="text-teal-acc">▸</span> <b className="text-mist-200">vad_filter=True</b> により無音区間をスキップし、RTX 3050 での処理を高速化。</li>
            </ul>
          )}
          {tab === "seek" && (
            <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-mist-400">
              <li className="flex gap-2"><span className="text-teal-acc">▸</span> Streamlit は再実行モデルのため、<b className="text-mist-200">HTML埋込 + JSブリッジ</b>で <code className="font-tc text-[11px] text-amber-acc">audio.currentTime</code> を直接制御する方式が確実。</li>
              <li className="flex gap-2"><span className="text-teal-acc">▸</span> 本画面は同一UXをブラウザで実装したプロトタイプ。字幕クリック→シーク→再生→ハイライトの導線がそのまま確認できる。</li>
            </ul>
          )}
          {tab === "deploy" && (
            <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-mist-400">
              <li className="flex gap-2"><span className="text-teal-acc">▸</span> モデルとランタイムをZIPに同梱するため<b className="text-mist-200">インターネット接続不要</b>。初回起動から CUDA で動作。</li>
              <li className="flex gap-2"><span className="text-teal-acc">▸</span> GUIは <b className="text-mist-200">Streamlit</b> 推奨。ネイティブ寄りの操作感が要る場合は PyQt6 + QMediaPlayer でも同一スキーマで実現可。</li>
            </ul>
          )}
        </div>

        <div className="border-t border-ink-700 bg-ink-900/70 px-5 py-2.5">
          <p className="font-tc text-[9.5px] text-mist-600">
            ※ 本画面はブラウザプロトタイプです。DBは localStorage / IndexedDB が SQLite の代替を務め、文字起こしは実機相当の結果を模擬しています。
          </p>
        </div>
      </div>
    </div>
  );
}
