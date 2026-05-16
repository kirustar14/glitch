"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Byte from "@/components/Byte";
import SpeechBubble from "@/components/SpeechBubble";
import PillButton from "@/components/PillButton";
import { addCourse, prettifyFilename, saveSelectedCourse } from "@/lib/profile";

const PROGRESS_MESSAGES = [
  "reading your slides...",
  "building your brain...",
  "almost ready...",
];

type Phase = "pick" | "uploading" | "naming";

type IngestResponse = {
  success: true;
  slug: string;
  originalFilename: string;
};

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [progressIdx, setProgressIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ingested, setIngested] = useState<IngestResponse | null>(null);
  const [courseName, setCourseName] = useState("");

  useEffect(() => {
    if (phase !== "uploading") return;
    const id = setInterval(() => {
      setProgressIdx((i) => (i + 1) % PROGRESS_MESSAGES.length);
    }, 2200);
    return () => clearInterval(id);
  }, [phase]);

  function pickFile(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("only PDF files are supported");
      return;
    }
    setFile(f);
  }

  async function startUpload() {
    if (!file) return;
    setError(null);
    setPhase("uploading");
    setProgressIdx(0);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const text = await res.text();
      let data: { success?: boolean; error?: string; slug?: string; originalFilename?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`non-JSON response (${res.status}): ${text.slice(0, 200)}`);
      }
      if (!res.ok || !data.success || !data.slug) {
        throw new Error(data.error || `ingest failed (${res.status})`);
      }

      const result: IngestResponse = {
        success: true,
        slug: data.slug,
        originalFilename: data.originalFilename ?? file.name,
      };
      setIngested(result);
      setCourseName(prettifyFilename(result.originalFilename));
      await new Promise((r) => setTimeout(r, 500));
      setPhase("naming");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "upload failed");
      setPhase("pick");
    }
  }

  function saveAndContinue() {
    if (!ingested) return;
    const trimmed = courseName.trim();
    if (!trimmed) {
      setError("give your course a name");
      return;
    }
    addCourse({
      name: trimmed,
      slug: ingested.slug,
      uploadedAt: new Date().toISOString(),
    });
    saveSelectedCourse(ingested.slug);
    router.push(`/dashboard?course=${encodeURIComponent(ingested.slug)}`);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    pickFile(f);
  }

  if (phase === "uploading") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 gap-8">
        <Byte size={200} mood="explaining" priority />
        <SpeechBubble tail="bottom">
          <span className="text-lg">{PROGRESS_MESSAGES[progressIdx]}</span>
        </SpeechBubble>
        <p className="text-sm text-neutral-400">
          this can take a minute on a big deck — hang tight
        </p>
      </main>
    );
  }

  if (phase === "naming" && ingested) {
    return (
      <main className="min-h-screen bg-white px-6 py-10">
        <div className="max-w-xl mx-auto">
          <header className="flex flex-col md:flex-row items-center gap-6 mb-10">
            <Byte size={140} mood="correct" priority />
            <SpeechBubble tail="left" className="md:max-w-md">
              <span className="text-base">
                got it! what should i call this course?
              </span>
            </SpeechBubble>
          </header>

          <label className="block">
            <span className="text-sm text-neutral-500">course name</span>
            <input
              autoFocus
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAndContinue();
              }}
              placeholder="e.g. Immunology Chapter 1"
              className="mt-2 w-full px-5 py-3 rounded-2xl border border-neutral-300 focus:outline-none focus:border-black text-lg"
            />
          </label>
          <p className="mt-2 text-xs text-neutral-400">
            slug: <code className="bg-neutral-100 px-1.5 py-0.5 rounded">{ingested.slug}</code>
          </p>

          {error && (
            <p className="mt-4 text-sm text-red-700 whitespace-pre-wrap">{error}</p>
          )}

          <div className="mt-8 flex justify-end">
            <PillButton onClick={saveAndContinue} disabled={!courseName.trim()}>
              Save Course →
            </PillButton>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-neutral-500 hover:text-black mb-6"
        >
          ← Back
        </button>

        <header className="flex flex-col md:flex-row items-center gap-6 mb-10">
          <Byte size={140} mood="checkin" priority />
          <SpeechBubble tail="left" className="md:max-w-md">
            <span className="text-base">
              drop your course materials and i&apos;ll build your curriculum
            </span>
          </SpeechBubble>
        </header>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`cursor-pointer border-2 border-dashed rounded-3xl p-14 text-center transition-colors ${
            dragOver
              ? "border-black bg-neutral-50"
              : "border-neutral-300 hover:border-neutral-500"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-lg font-medium">{file.name}</p>
              <p className="text-sm text-neutral-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB · click to choose a different file
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-lg font-medium">
                drop a PDF here or click to upload
              </p>
              <p className="text-sm text-neutral-500">one file at a time, PDFs only</p>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-700 whitespace-pre-wrap">{error}</p>
        )}

        <div className="mt-8 flex justify-end gap-3">
          <PillButton variant="secondary" href="/dashboard">
            Cancel
          </PillButton>
          <PillButton onClick={startUpload} disabled={!file}>
            Ingest →
          </PillButton>
        </div>
      </div>
    </main>
  );
}
