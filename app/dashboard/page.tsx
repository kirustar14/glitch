"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Byte from "@/components/Byte";
import SpeechBubble from "@/components/SpeechBubble";
import PillButton from "@/components/PillButton";
import {
  loadProfile,
  loadProgress,
  loadCourses,
  loadSelectedCourse,
  saveSelectedCourse,
  type Course,
  type StudentProfile,
} from "@/lib/profile";

type CurriculumItem = {
  title: string;
  description: string;
  estimatedMinutes: number;
  difficulty: string;
};

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    const p = loadProfile();
    if (!p) {
      router.replace("/onboarding");
      return;
    }
    setProfile(p);
    setCompleted(loadProgress().completedTopics);

    const allCourses = loadCourses();
    setCourses(allCourses);

    const fromUrl = params.get("course") ?? "";
    const fromStorage = loadSelectedCourse();
    const valid = (slug: string) =>
      slug && allCourses.some((c) => c.slug === slug) ? slug : "";

    const resolved =
      valid(fromUrl) || valid(fromStorage) || (allCourses[0]?.slug ?? "");

    if (resolved) {
      saveSelectedCourse(resolved);
    }
    setSelectedSlug(resolved);
  }, [router, params]);

  useEffect(() => {
    if (!profile || !selectedSlug) {
      setCurriculum([]);
      setSource(null);
      setError(null);
      return;
    }

    const cacheKey = `curriculum_${selectedSlug}_${profile.learningStyle}_${profile.skillLevel}`;
    const CACHE_TTL_MS = 60 * 60 * 1000;

    type CachedCurriculum = {
      curriculum: CurriculumItem[];
      source: string | null;
      savedAt: number;
    };

    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as CachedCurriculum;
        if (
          cached &&
          Array.isArray(cached.curriculum) &&
          typeof cached.savedAt === "number" &&
          Date.now() - cached.savedAt < CACHE_TTL_MS
        ) {
          console.log("[dashboard] cache hit:", cacheKey);
          setCurriculum(cached.curriculum);
          setSource(cached.source ?? "cache");
          setError(null);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn("[dashboard] cache read failed:", e);
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setCurriculum([]);

    (async () => {
      try {
        const res = await fetch("/api/curriculum", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentProfile: profile,
            courseSlug: selectedSlug,
          }),
          signal: controller.signal,
        });
        const text = await res.text();
        console.log("[dashboard] /api/curriculum status:", res.status);
        console.log("[dashboard] /api/curriculum raw:", text);

        let data: { curriculum?: unknown; error?: string; source?: string };
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(
            `non-JSON response (status ${res.status}): ${text.slice(0, 200)}`
          );
        }

        if (!res.ok && !Array.isArray(data.curriculum)) {
          throw new Error(data.error || `request failed (${res.status})`);
        }
        if (!Array.isArray(data.curriculum)) {
          throw new Error(
            "response did not include a curriculum array — got: " +
              JSON.stringify(data).slice(0, 200)
          );
        }

        const items = data.curriculum.filter(
          (it): it is CurriculumItem =>
            !!it &&
            typeof it === "object" &&
            typeof (it as CurriculumItem).title === "string"
        );

        if (controller.signal.aborted) return;

        setCurriculum(items);
        setSource(data.source ?? null);
        if (items.length === 0) {
          setError("curriculum came back empty");
        } else {
          try {
            const payload: CachedCurriculum = {
              curriculum: items,
              source: data.source ?? null,
              savedAt: Date.now(),
            };
            localStorage.setItem(cacheKey, JSON.stringify(payload));
          } catch (e) {
            console.warn("[dashboard] cache write failed:", e);
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") {
          console.log("[dashboard] curriculum fetch aborted");
          return;
        }
        console.error("[dashboard] curriculum load failed:", e);
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "something went wrong");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [profile, selectedSlug]);

  function selectCourse(slug: string) {
    saveSelectedCourse(slug);
    setSelectedSlug(slug);
    router.replace(`/dashboard?course=${encodeURIComponent(slug)}`);
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-neutral-500">loading…</p>
      </main>
    );
  }

  const selectedCourse = courses.find((c) => c.slug === selectedSlug) || null;
  const hasCourses = courses.length > 0;

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <h1 className="text-4xl font-bold">Hey {profile.name}!</h1>
          <div className="flex flex-wrap gap-3">
            {hasCourses && (
              <PillButton href="/upload" variant="secondary">
                Upload New Course
              </PillButton>
            )}
            <PillButton href="/onboarding" variant="secondary">
              Edit Profile
            </PillButton>
          </div>
        </header>

        <section className="grid md:grid-cols-[260px,1fr] gap-8 mb-12">
          <div className="flex flex-col items-center md:items-start gap-4">
            <SpeechBubble tail="bottom">
              <span className="text-sm">
                {hasCourses
                  ? "here's what i picked for you"
                  : "upload a course to get started"}
              </span>
            </SpeechBubble>
            <Byte size={220} mood={hasCourses ? "explaining" : "checkin"} priority />
          </div>

          <div className="border border-neutral-200 rounded-2xl p-6">
            <h2 className="text-sm uppercase tracking-wider text-neutral-400 mb-4">
              your learning profile
            </h2>
            <dl className="grid grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <dt className="text-xs text-neutral-500">name</dt>
                <dd className="text-lg font-medium">{profile.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">learning style</dt>
                <dd className="text-lg font-medium">{profile.learningStyle}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">level</dt>
                <dd className="text-lg font-medium">{profile.skillLevel}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">lesson length</dt>
                <dd className="text-lg font-medium">{profile.lessonLength}</dd>
              </div>
            </dl>
          </div>
        </section>

        {!hasCourses ? (
          <section className="border border-neutral-200 rounded-3xl p-12 flex flex-col items-center text-center gap-6">
            <p className="text-xl font-medium">no courses yet</p>
            <p className="text-neutral-500 max-w-md">
              drop in a PDF of your slides or notes and byte will build a personalized
              curriculum from it.
            </p>
            <PillButton href="/upload">Upload Your First Course →</PillButton>
          </section>
        ) : (
          <section>
            <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
              <h2 className="text-2xl font-bold">your curriculum</h2>
              {curriculum.length > 0 && (
                <span className="text-xs text-neutral-400">
                  {curriculum.length} topics
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {courses.map((c) => {
                const active = c.slug === selectedSlug;
                return (
                  <button
                    key={c.slug}
                    onClick={() => selectCourse(c.slug)}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                      active
                        ? "bg-black text-white border-black"
                        : "bg-white text-black border-neutral-300 hover:bg-neutral-50"
                    }`}
                    title={c.slug}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>

            {selectedCourse && (
              <p className="text-xs text-neutral-400 mb-6">
                showing curriculum for{" "}
                <span className="font-medium text-neutral-600">
                  {selectedCourse.name}
                </span>
              </p>
            )}

            {loading && (
              <div className="border border-neutral-200 rounded-2xl p-10 text-center text-neutral-500">
                byte is putting together your curriculum…
              </div>
            )}

            {!loading && error && curriculum.length === 0 && (
              <div className="border border-red-200 bg-red-50 rounded-2xl p-6 text-red-700 text-sm whitespace-pre-wrap">
                <strong className="block mb-1">couldn&apos;t load curriculum</strong>
                {error}
              </div>
            )}

            {!loading && curriculum.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                {curriculum.map((item, i) => {
                  const isDone = completed.includes(item.title);
                  return (
                    <div
                      key={`${item.title}-${i}`}
                      className="border border-neutral-200 rounded-2xl p-6 flex flex-col gap-3 hover:border-neutral-400 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                        {isDone && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            done
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-600 text-sm leading-relaxed flex-1">
                        {item.description}
                      </p>
                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span>~{item.estimatedMinutes} min</span>
                        <span className="uppercase tracking-wider">{item.difficulty}</span>
                      </div>
                      <div className="mt-2">
                        <PillButton
                          href={`/lesson?topic=${encodeURIComponent(
                            item.title
                          )}&course=${encodeURIComponent(selectedSlug)}`}
                        >
                          {isDone ? "Review →" : "Start →"}
                        </PillButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-white">
          <p className="text-neutral-500">loading…</p>
        </main>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
