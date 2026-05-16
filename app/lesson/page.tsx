"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Byte from "@/components/Byte";
import SpeechBubble from "@/components/SpeechBubble";
import PillButton from "@/components/PillButton";
import {
  loadProfile,
  loadSelectedCourse,
  markTopicComplete,
  recordCheckpoint,
  type StudentProfile,
} from "@/lib/profile";

type Section = {
  title: string;
  content: string;
  type: "explanation" | "example" | "visual_description";
  imageUrl?: string;
};

type Checkpoint = {
  id: string;
  question: string;
  correctAnswer: string;
  hint: string;
  conceptTested: string;
};

type LessonData = {
  sections: Section[];
  checkpoints: Checkpoint[];
};

type Attempt = {
  conceptTested: string;
  correct: boolean;
  question: string;
  answer: string;
};

type CheckpointState = {
  answer: string;
  submitted: boolean;
  correct: boolean;
  feedback: string;
  showHint: boolean;
  checking: boolean;
};

const emptyCheckpointState = (): CheckpointState => ({
  answer: "",
  submitted: false,
  correct: false,
  feedback: "",
  showHint: false,
  checking: false,
});

function attemptsKey(courseSlug: string, topic: string): string {
  return `attempts_${courseSlug}_${topic}`;
}

function LessonInner() {
  const router = useRouter();
  const params = useSearchParams();
  const topic = params.get("topic") || "";
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseSlug, setCourseSlug] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [failedConcepts, setFailedConcepts] = useState<string[]>([]);
  const [stage, setStage] = useState(0);
  const [checkpointStates, setCheckpointStates] = useState<CheckpointState[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const FALLBACK_VIBE_MESSAGES = [
    "byte is warming up the neurons...",
    "loading your personalized experience...",
    "almost there, making it perfect for you...",
    "byte is reading every word so you don't have to...",
    "good things take time... this is a good thing",
  ];
  const [vibeMessages, setVibeMessages] = useState<string[]>([]);
  const [vibeIndex, setVibeIndex] = useState(0);
  const [refilling, setRefilling] = useState(false);

  useEffect(() => {
    if (!loading || !profile || !topic) return;

    let cancelled = false;

    async function fetchBatch(count: number): Promise<string[]> {
      try {
        const res = await fetch("/api/vibe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: profile!.name,
            interests: profile!.interests || "everything",
            topic,
            count,
          }),
        });
        const data = (await res.json()) as { messages?: string[] };
        if (res.ok && Array.isArray(data.messages) && data.messages.length > 0) {
          return data.messages;
        }
      } catch (e) {
        console.warn("[lesson] vibe fetch failed:", e);
      }
      return [];
    }

    (async () => {
      const batch = await fetchBatch(10);
      if (cancelled) return;
      setVibeMessages(batch.length > 0 ? batch : FALLBACK_VIBE_MESSAGES);
      setVibeIndex(0);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, profile, topic]);

  useEffect(() => {
    if (!loading || vibeMessages.length === 0) return;
    const id = setInterval(() => {
      setVibeIndex((i) => i + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [loading, vibeMessages.length]);

  useEffect(() => {
    if (!loading || !profile || !topic) return;
    if (refilling) return;
    if (vibeMessages.length === 0) return;
    if (vibeIndex < vibeMessages.length - 2) return;

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
            topic,
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
        console.warn("[lesson] vibe refill failed:", e);
      } finally {
        if (!cancelled) setRefilling(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vibeIndex, vibeMessages.length, loading, profile, topic, refilling]);

  const currentVibe =
    vibeMessages.length > 0
      ? vibeMessages[vibeIndex % vibeMessages.length]
      : "warming up...";

  useEffect(() => {
    const p = loadProfile();
    if (!p) {
      router.replace("/onboarding");
      return;
    }
    setProfile(p);

    if (!topic) {
      setError("no topic specified");
      setLoading(false);
      return;
    }

    const slug = (params.get("course") ?? loadSelectedCourse() ?? "").trim();
    if (!slug) {
      setError("no course selected — pick one on the dashboard first");
      setLoading(false);
      return;
    }
    setCourseSlug(slug);

    let prevAttempts: Attempt[] = [];
    try {
      const raw = localStorage.getItem(attemptsKey(slug, topic));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) prevAttempts = parsed as Attempt[];
      }
    } catch {}
    const willBeReview = prevAttempts.some((a) => !a.correct);

    type LessonResponse = {
      lesson: LessonData;
      reviewMode?: boolean;
      failedConcepts?: string[];
      error?: string;
    };

    async function fetchLesson(studentProfile: StudentProfile): Promise<LessonResponse> {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          studentProfile,
          courseSlug: slug,
          previousAttempts: willBeReview ? prevAttempts : undefined,
        }),
      });
      const data = (await res.json()) as LessonResponse;
      if (!res.ok) throw new Error(data.error || "failed to load lesson");
      return data;
    }

    function looksBroken(l: LessonData): boolean {
      const haystack = [
        ...l.sections.map((s) => `${s.title} ${s.content}`),
        ...(l.checkpoints || []).map(
          (c) => `${c.question} ${c.hint} ${c.correctAnswer}`
        ),
      ]
        .join(" ")
        .toLowerCase();
      return /didn't load|did not load|didnt load|timeout|transparent/.test(haystack);
    }

    (async () => {
      try {
        let result = await fetchLesson(p);
        if (looksBroken(result.lesson)) {
          console.warn("[lesson] first response looked broken — silently retrying");
          try {
            const retry = await fetchLesson(p);
            if (!looksBroken(retry.lesson)) result = retry;
          } catch (retryErr) {
            console.warn("[lesson] silent retry failed:", retryErr);
          }
        }
        setLesson(result.lesson);
        setReviewMode(!!result.reviewMode);
        setFailedConcepts(result.failedConcepts ?? []);
        setCheckpointStates(result.lesson.checkpoints.map(() => emptyCheckpointState()));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, topic, params]);

  function updateCheckpointState(idx: number, patch: Partial<CheckpointState>) {
    setCheckpointStates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );
  }

  async function submitCheckpoint(idx: number) {
    if (!lesson || !profile) return;
    const cp = lesson.checkpoints[idx];
    const cs = checkpointStates[idx];
    if (!cp || !cs || cs.submitted || cs.checking || !cs.answer.trim()) return;

    const studentAnswer = cs.answer.trim();
    updateCheckpointState(idx, { checking: true });

    let correct = false;
    let claudeFeedback = "";
    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check",
          question: cp.question,
          correctAnswer: cp.correctAnswer,
          studentAnswer,
        }),
      });
      const data = (await res.json()) as { correct?: boolean; feedback?: string };
      if (!res.ok) throw new Error("check failed");
      correct = data.correct === true;
      claudeFeedback = typeof data.feedback === "string" ? data.feedback : "";
    } catch (e) {
      console.warn("[lesson] check fell back to local match:", e);
      const lower = studentAnswer.toLowerCase();
      correct = cp.correctAnswer
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((w) => lower.includes(w));
    }

    recordCheckpoint(topic, correct);

    const feedback = correct
      ? claudeFeedback || "yes! exactly right. you're getting this 🎉"
      : claudeFeedback || `not quite. here's a hint: ${cp.hint}`;

    updateCheckpointState(idx, {
      submitted: true,
      correct,
      feedback,
      showHint: !correct,
      checking: false,
    });

    const newAttempt: Attempt = {
      conceptTested: cp.conceptTested,
      correct,
      question: cp.question,
      answer: studentAnswer,
    };
    setAttempts((prev) => {
      const next = [...prev, newAttempt];
      try {
        localStorage.setItem(attemptsKey(courseSlug, topic), JSON.stringify(next));
      } catch (err) {
        console.warn("[lesson] failed to persist attempts:", err);
      }
      return next;
    });

    fetch("/api/checkpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: profile.name,
        courseSlug,
        topic,
        question: cp.question,
        answer: studentAnswer,
        correct,
        hint: cp.hint,
        conceptTested: cp.conceptTested,
      }),
    })
      .then((r) =>
        r.ok
          ? console.log(`[lesson] checkpoint ${idx + 1} saved to gbrain`)
          : console.warn(`[lesson] checkpoint ${idx + 1} save returned`, r.status)
      )
      .catch((err) => console.warn("[lesson] checkpoint save failed:", err));
  }

  function continueAfter(idx: number) {
    setStage((s) => Math.max(s, idx + 1));
    if (idx + 1 >= (lesson?.checkpoints.length ?? 0)) {
      markTopicComplete(topic);
    }
  }

  function reviewAgain() {
    window.location.reload();
  }

  function finishLesson() {
    markTopicComplete(topic);
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white gap-6 px-6">
        <SpeechBubble tail="bottom" className="max-w-md text-center">
          <span key={vibeIndex} className="vibe-fade inline-block text-lg">
            {currentVibe}
          </span>
        </SpeechBubble>
        <Byte size={200} mood="explaining" priority />
      </main>
    );
  }

  if (error || !lesson) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white gap-4 px-6">
        <Byte size={120} mood="default" />
        <p className="text-red-700">{error || "lesson unavailable"}</p>
        <PillButton href="/dashboard">Back to Dashboard</PillButton>
      </main>
    );
  }

  const cpCount = lesson.checkpoints.length;
  const lessonDone = stage >= cpCount;
  const sectionChunks: Section[][] = [
    lesson.sections.slice(0, 2),
    lesson.sections.slice(2, 4),
    lesson.sections.slice(4),
  ];

  const failedList = failedConcepts.join(", ");
  const opener =
    reviewMode && failedList
      ? `welcome back ${profile?.name}! last time you struggled with ${failedList} — let's fix that 💪`
      : `hey ${profile?.name}, let's dig into this. i've tuned this for your ${profile?.learningStyle}-style brain at the ${profile?.skillLevel} level.`;

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-neutral-500 hover:text-black mb-6"
        >
          ← Back to Dashboard
        </button>

        <header className="flex flex-col md:flex-row items-center gap-6 mb-10">
          <Byte size={140} mood={reviewMode ? "checkin" : "explaining"} priority />
          <SpeechBubble tail="left" className="md:max-w-md">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold">{topic}</h1>
                {reviewMode && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
                    review
                  </span>
                )}
              </div>
              <p className="text-neutral-600 text-sm">{opener}</p>
            </div>
          </SpeechBubble>
        </header>

        {reviewMode && failedList && (
          <p className="text-xs text-neutral-500 mb-6">
            let&apos;s review what tripped you up:{" "}
            <span className="font-medium text-neutral-700">{failedList}</span>
          </p>
        )}

        <div className="flex flex-col gap-10">
          {sectionChunks.map((chunk, chunkIdx) => {
            if (chunkIdx > stage) return null;
            if (chunk.length === 0 && chunkIdx > 0) return null;
            return (
              <div key={`chunk-${chunkIdx}`} className="flex flex-col gap-6">
                {chunk.map((s, i) => (
                  <article
                    key={`s-${chunkIdx}-${i}`}
                    className="border border-neutral-200 rounded-2xl p-6 bg-white"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          s.type === "example"
                            ? "bg-amber-100 text-amber-800"
                            : s.type === "visual_description"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {s.type.replace("_", " ")}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{s.title}</h3>
                    {s.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.imageUrl}
                        alt={s.title}
                        className="w-full rounded-2xl my-4 max-h-72 object-cover shadow-sm"
                      />
                    )}
                    <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">
                      {s.content}
                    </p>
                  </article>
                ))}

                {lesson.checkpoints[chunkIdx] && (
                  <CheckpointCard
                    idx={chunkIdx}
                    checkpoint={lesson.checkpoints[chunkIdx]}
                    state={checkpointStates[chunkIdx] ?? emptyCheckpointState()}
                    onAnswerChange={(value) =>
                      updateCheckpointState(chunkIdx, { answer: value })
                    }
                    onSubmit={() => submitCheckpoint(chunkIdx)}
                    onShowHint={() =>
                      updateCheckpointState(chunkIdx, { showHint: true })
                    }
                    onContinue={() => continueAfter(chunkIdx)}
                    isLast={chunkIdx === cpCount - 1}
                  />
                )}
              </div>
            );
          })}
        </div>

        {lessonDone && (
          <div className="mt-12 border-2 border-black rounded-2xl p-6 bg-neutral-50">
            <div className="flex items-start gap-4 mb-4">
              <Byte
                size={80}
                float={false}
                mood={attempts.every((a) => a.correct) ? "correct" : "checkin"}
              />
              <SpeechBubble tail="left">
                <strong className="block mb-1">lesson complete</strong>
                <span>
                  {attempts.filter((a) => a.correct).length}/{attempts.length}{" "}
                  checkpoints correct.{" "}
                  {attempts.every((a) => a.correct)
                    ? "you nailed it."
                    : "we'll hit the rough spots again next time."}
                </span>
              </SpeechBubble>
            </div>
            <div className="flex flex-wrap gap-3 justify-end">
              {!attempts.every((a) => a.correct) && (
                <PillButton variant="secondary" onClick={reviewAgain}>
                  Review This Topic Again →
                </PillButton>
              )}
              <PillButton onClick={finishLesson}>Next Topic →</PillButton>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function CheckpointCard({
  idx,
  checkpoint,
  state,
  onAnswerChange,
  onSubmit,
  onShowHint,
  onContinue,
  isLast,
}: {
  idx: number;
  checkpoint: Checkpoint;
  state: CheckpointState;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
  onShowHint: () => void;
  onContinue: () => void;
  isLast: boolean;
}) {
  const borderClass = !state.submitted
    ? "border-black"
    : state.correct
    ? "border-green-500 bg-green-50"
    : "border-amber-400 bg-amber-50";

  const byteMood = !state.submitted
    ? "checkin"
    : state.correct
    ? "correct"
    : "default";

  return (
    <div className={`mt-2 border-2 rounded-2xl p-6 ${borderClass}`}>
      <div className="flex items-start gap-4 mb-4">
        <Byte size={64} float={false} mood={byteMood} />
        <SpeechBubble tail="left">
          <div className="flex items-center gap-2 mb-1">
            <strong>checkpoint {idx + 1}</strong>
            <span className="text-xs text-neutral-400">
              · concept: {checkpoint.conceptTested}
            </span>
          </div>
          <span>{checkpoint.question}</span>
        </SpeechBubble>
      </div>

      <textarea
        value={state.answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="your answer…"
        disabled={state.submitted}
        className="w-full px-4 py-3 rounded-xl border border-neutral-300 focus:outline-none focus:border-black min-h-[80px] disabled:bg-neutral-100 disabled:text-neutral-600"
      />

      {!state.submitted && (
        <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
          <button
            onClick={onShowHint}
            className="text-sm text-neutral-500 hover:text-black"
          >
            Need a Hint?
          </button>
          <PillButton
            onClick={onSubmit}
            disabled={!state.answer.trim() || state.checking}
          >
            {state.checking ? "Checking…" : "Check Answer"}
          </PillButton>
        </div>
      )}

      {state.showHint && !state.submitted && (
        <p className="mt-3 text-sm text-neutral-600">💡 hint: {checkpoint.hint}</p>
      )}

      {state.submitted && (
        <>
          <p className="mt-4 text-sm text-neutral-800">{state.feedback}</p>
          {!state.correct && (
            <p className="mt-2 text-xs text-neutral-500">
              expected: <em>{checkpoint.correctAnswer}</em>
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <PillButton onClick={onContinue}>
              {isLast ? "Finish Lesson →" : "Continue →"}
            </PillButton>
          </div>
        </>
      )}
    </div>
  );
}

export default function LessonPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-white">
          <p className="text-neutral-500">loading…</p>
        </main>
      }
    >
      <LessonInner />
    </Suspense>
  );
}
