"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Byte from "@/components/Byte";
import SpeechBubble from "@/components/SpeechBubble";
import PillButton from "@/components/PillButton";
import {
  addCourse,
  loadProfile,
  prettifyFilename,
  saveSelectedCourse,
  type StudentProfile,
} from "@/lib/profile";

const FALLBACK_VIBE_MESSAGES = [
  "byte is warming up the neurons...",
  "loading your personalized experience...",
  "almost there, making it perfect for you...",
  "byte is reading every word so you don't have to...",
  "good things take time... this is a good thing",
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
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ingested, setIngested] = useState<IngestResponse | null>(null);
  const [courseName, setCourseName] = useState("");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [vibeMessages, setVibeMessages] = useState<string[]>([]);
  const [vibeIndex, setVibeIndex] = useState(0);
  const [refilling, setRefilling] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  useEffect(() => {
    if (phase !== "uploading" || !profile) return;

    const fileTopic = file?.name?.replace(/\.pdf$/i, "") || "your course";
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/vibe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: profile.name,
            interests: profile.interests || "everything",
            topic: fileTopic,
            count: 10,
          }),
        });
        const data = (await res.json()) as { messages?: string[] };
        if (cancelled) return;
        if (res.ok && Array.isArray(data.messages) && data.messages.length > 0) {
          setVibeMessages(data.messages);
        } else {
          setVibeMessages(FALLBACK_VIBE_MESSAGES);
        }
      } catch (e) {
        console.warn("[upload] vibe fetch failed:", e);
        if (!cancelled) setVibeMessages(FALLBACK_VIBE_MESSAGES);
      }
      setVibeIndex(0);
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, profile, file]);

  useEffect(() => {
    if (phase !== "uploading" || vibeMessages.length === 0) return;
    const id = setInterval(() => {
      setVibeIndex((i) => i + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [phase, vibeMessages.length]);

  useEffect(() => {
    if (phase !== "uploading" || !profile) return;
    if (refilling || vibeMessages.length === 0) return;
    if (vibeIndex < vibeMessages.length - 2) return;

    const fileTopic = file?.name?.replace(/\.pdf$/i, "") || "your course";
    let cancelled = false;
    setRefilling(true);
    (async () => {
      try {
        const res = await fetch("/api/vibe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: profile.name,
            interests: profile.interests || "everything",
            topic: fileTopic,
            count: 10,
          }),
        });
        const data = (await res.json()) as { messages?: string[] };
        if (
          !cancelled &&
          res.ok &&
          Array.isArray(data.messages) &&
          data.messages.length > 0
        ) {
          setVibeMessages((prev) => [...prev, ...data.messages!]);
        }
      } catch (e) {
        console.warn("[upload] vibe refill failed:", e);
      } finally {
        if (!cancelled) setRefilling(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vibeIndex, vibeMessages.length, phase, profile, file, refilling]);

  const currentVibe =
    vibeMessages.length > 0
      ? vibeMessages[vibeIndex % vibeMessages.length]
      : "warming up...";

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
      <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 gap-6">
        <SpeechBubble tail="bottom" className="max-w-md text-center">
          <span key={vibeIndex} className="vibe-fade inline-block text-lg">
            {currentVibe}
          </span>
        </SpeechBubble>
        <Byte size={200} mood="explaining" priority />
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
