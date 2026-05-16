import { NextResponse } from "next/server";
import { gbrainQuery } from "@/lib/gbrain";
import { complete, extractJSON, unwrapArray } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CurriculumItem = {
  title: string;
  description: string;
  estimatedMinutes: number;
  difficulty: string;
};

export async function POST(req: Request) {
  const debug: Record<string, unknown> = {};
  try {
    const body = await req.json();
    const { studentProfile } = body;
    const courseSlug =
      typeof body.courseSlug === "string"
        ? body.courseSlug.trim()
        : typeof body.courseName === "string"
        ? body.courseName.trim()
        : "";

    if (!studentProfile) {
      return NextResponse.json({ error: "studentProfile is required" }, { status: 400 });
    }
    if (!courseSlug) {
      return NextResponse.json(
        { error: "courseSlug is required — select a course first" },
        { status: 400 }
      );
    }

    debug.courseSlug = courseSlug;

    const topics = await gbrainQuery(
      "key concepts mechanisms theories explained in this material",
      { source: courseSlug }
    );
    debug.gbrainTopicsLength = topics.length;
    debug.gbrainTopicsPreview = topics.slice(0, 200);

    const prompt = `Course: ${courseSlug}. Only use topics from this specific course.
Given this student profile: ${JSON.stringify(
      studentProfile
    )} and these course topics: ${topics}, generate a personalized curriculum as JSON array of {title, description, estimatedMinutes, difficulty} ordered for this specific learner. Return ONLY valid JSON array, nothing else.`;

    let curriculum: CurriculumItem[] = [];
    let source: "claude" | "fallback" = "fallback";
    try {
      const raw = await complete(prompt, 2048);
      debug.rawPreview = raw.slice(0, 400);
      const parsed = extractJSON<unknown>(raw);
      const arr = unwrapArray<CurriculumItem>(parsed);
      curriculum = arr.filter(
        (it) => it && typeof it === "object" && typeof it.title === "string"
      );
      if (curriculum.length > 0) source = "claude";
    } catch (e) {
      debug.parseError = e instanceof Error ? e.message : String(e);
    }

    if (curriculum.length === 0) {
      curriculum = fallbackCurriculum(studentProfile);
      source = "fallback";
    }

    curriculum = curriculum.map((it) => ({
      title: String(it.title ?? "Untitled"),
      description: String(it.description ?? ""),
      estimatedMinutes: Number.isFinite(it.estimatedMinutes)
        ? Number(it.estimatedMinutes)
        : 15,
      difficulty: String(it.difficulty ?? "beginner"),
    }));

    console.log("[curriculum] source:", source, "count:", curriculum.length, debug);

    return NextResponse.json({ curriculum, source, courseSlug, debug });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[curriculum] error:", message, debug);
    return NextResponse.json(
      { error: message, curriculum: fallbackCurriculum({}), source: "error-fallback" },
      { status: 200 }
    );
  }
}

function fallbackCurriculum(profile: { lessonLength?: string }): CurriculumItem[] {
  const mins = profile.lessonLength === "deep" ? 40 : profile.lessonLength === "medium" ? 20 : 10;
  return [
    {
      title: "Foundations",
      description: "Core vocabulary and the big picture so everything else has a place to land.",
      estimatedMinutes: mins,
      difficulty: "beginner",
    },
    {
      title: "Key Concepts",
      description: "The handful of ideas that do most of the heavy lifting in this subject.",
      estimatedMinutes: mins,
      difficulty: "intermediate",
    },
    {
      title: "Worked Examples",
      description: "See the concepts in motion with real, end-to-end examples.",
      estimatedMinutes: mins,
      difficulty: "intermediate",
    },
    {
      title: "Common Pitfalls",
      description: "Mistakes that trip everyone up, and how to spot them early.",
      estimatedMinutes: mins,
      difficulty: "intermediate",
    },
    {
      title: "Putting It Together",
      description: "Combine the pieces into a working mental model you can use.",
      estimatedMinutes: mins,
      difficulty: "advanced",
    },
  ];
}
