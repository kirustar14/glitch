import { NextResponse } from "next/server";
import OpenAI from "openai";
import { gbrainQuery } from "@/lib/gbrain";
import { complete, extractJSON } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type PreviousAttempt = {
  conceptTested: string;
  correct: boolean;
  question?: string;
  answer?: string;
};

function failedConcepts(attempts: PreviousAttempt[]): string[] {
  const seen = new Set<string>();
  for (const a of attempts) {
    if (!a.correct && a.conceptTested && !seen.has(a.conceptTested)) {
      seen.add(a.conceptTested);
    }
  }
  return Array.from(seen);
}

function buildPrompt(
  topic: string,
  studentProfile: unknown,
  gbrainResults: string,
  pastProgress: string = ""
): string {
  const progressSection =
    pastProgress &&
    !pastProgress.includes("gbrain timeout") &&
    pastProgress.length > 50
      ? `\nThis student's past learning history:\n${pastProgress.slice(0, 1000)}\nAddress any recurring gaps.\n`
      : "";

  return `You are Byte, a friendly tutor for CSE 234 Data-Centric AI at UCSD.

Here is actual content from the course slides:
${gbrainResults}

Generate a lesson teaching '${topic}' to this student: ${JSON.stringify(studentProfile)}
${progressSection}
Rules:
- Use ONLY concepts from the course content above
- Quote specific things from the slides
- Adapt explanation style to their learning preference
- Keep it short if they prefer short lessons
- Generate at least 5 sections so checkpoints can be interspersed naturally

Return ONLY this exact JSON:
{
  "sections": [
    {"title": "string", "content": "string", "type": "explanation"|"example"|"visual_description"}
  ],
  "checkpoints": [
    {"id": "string", "question": "string", "correctAnswer": "string", "hint": "string", "conceptTested": "string"},
    {"id": "string", "question": "string", "correctAnswer": "string", "hint": "string", "conceptTested": "string"},
    {"id": "string", "question": "string", "correctAnswer": "string", "hint": "string", "conceptTested": "string"}
  ]
}

Generate exactly 3 checkpoints, each testing a DIFFERENT concept from the lesson. Space them naturally - checkpoint 1 after first 2 sections, checkpoint 2 after next 2 sections, checkpoint 3 at the end.`;
}

function buildReviewPrompt(
  topic: string,
  studentProfile: unknown,
  gbrainResults: string,
  failed: string[]
): string {
  const failedList = failed.join(", ");
  return `You are Byte, a friendly tutor for CSE 234 Data-Centric AI at UCSD.

Here is actual content from the course slides:
${gbrainResults}

This student is reviewing '${topic}'. They previously got these WRONG: ${failedList}.

Generate a lesson that briefly covers what they know, then focuses deeply on their weak spots. Generate 3 new checkpoints specifically targeting ${failedList}.

Student profile: ${JSON.stringify(studentProfile)}

Rules:
- Use ONLY concepts from the course content above
- Front-load review of what they got right; spend most of the lesson re-teaching the failed concepts in a new way
- Each new checkpoint must target one of: ${failedList}

Return ONLY this exact JSON:
{
  "sections": [
    {"title": "string", "content": "string", "type": "explanation"|"example"|"visual_description"}
  ],
  "checkpoints": [
    {"id": "string", "question": "string", "correctAnswer": "string", "hint": "string", "conceptTested": "string"},
    {"id": "string", "question": "string", "correctAnswer": "string", "hint": "string", "conceptTested": "string"},
    {"id": "string", "question": "string", "correctAnswer": "string", "hint": "string", "conceptTested": "string"}
  ]
}`;
}

function buildRetryPrompt(
  topic: string,
  studentProfile: unknown,
  gbrainResults: string
): string {
  return `Teach '${topic}' to this student: ${JSON.stringify(studentProfile)}.

Course content to use:
${gbrainResults}

Output ONLY raw JSON. No prose, no markdown fences, no explanation. Start your response with { and end with }.

Schema:
{"sections":[{"title":"string","content":"string","type":"explanation"}],"checkpoints":[{"id":"string","question":"string","correctAnswer":"string","hint":"string","conceptTested":"string"},{"id":"string","question":"string","correctAnswer":"string","hint":"string","conceptTested":"string"},{"id":"string","question":"string","correctAnswer":"string","hint":"string","conceptTested":"string"}]}`;
}

function normalizeCheckpoint(c: unknown, fallbackIdx: number): Checkpoint | null {
  if (!c || typeof c !== "object") return null;
  const obj = c as Record<string, unknown>;
  const question = typeof obj.question === "string" ? obj.question : "";
  if (!question) return null;
  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : `cp${fallbackIdx + 1}`,
    question,
    correctAnswer: String(obj.correctAnswer ?? ""),
    hint: String(obj.hint ?? ""),
    conceptTested:
      typeof obj.conceptTested === "string" && obj.conceptTested
        ? obj.conceptTested
        : `concept-${fallbackIdx + 1}`,
  };
}

function validateLesson(parsed: unknown): LessonData | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as { sections?: unknown; checkpoints?: unknown; checkpoint?: unknown };

  if (!Array.isArray(p.sections) || p.sections.length === 0) return null;
  const sections = p.sections.filter(
    (s) =>
      s &&
      typeof s === "object" &&
      typeof (s as Section).title === "string" &&
      typeof (s as Section).content === "string"
  ) as Section[];
  if (sections.length === 0) return null;

  let rawCheckpoints: unknown[] = [];
  if (Array.isArray(p.checkpoints)) {
    rawCheckpoints = p.checkpoints;
  } else if (p.checkpoint && typeof p.checkpoint === "object") {
    rawCheckpoints = [p.checkpoint];
  }
  const checkpoints = rawCheckpoints
    .map((c, i) => normalizeCheckpoint(c, i))
    .filter((c): c is Checkpoint => c !== null);
  if (checkpoints.length === 0) return null;

  return {
    sections: sections.map((s) => ({
      title: s.title,
      content: s.content,
      type:
        s.type === "example" || s.type === "visual_description"
          ? s.type
          : "explanation",
    })),
    checkpoints,
  };
}

async function tryGenerateLesson(
  prompt: string,
  label: string
): Promise<LessonData | null> {
  try {
    const raw = await complete(prompt, 3500);
    console.log(`[lesson:${label}] raw preview:`, raw.slice(0, 400));
    const parsed = extractJSON<unknown>(raw);
    const lesson = validateLesson(parsed);
    if (!lesson) {
      console.warn(`[lesson:${label}] validation failed`);
    }
    return lesson;
  } catch (e) {
    console.error(`[lesson:${label}] parse error:`, e);
    return null;
  }
}

async function evaluateAnswer(body: {
  question?: unknown;
  correctAnswer?: unknown;
  studentAnswer?: unknown;
}) {
  const question = typeof body.question === "string" ? body.question : "";
  const correctAnswer =
    typeof body.correctAnswer === "string" ? body.correctAnswer : "";
  const studentAnswer =
    typeof body.studentAnswer === "string" ? body.studentAnswer : "";

  if (!question || !correctAnswer || !studentAnswer) {
    return NextResponse.json(
      { error: "question, correctAnswer, and studentAnswer are required" },
      { status: 400 }
    );
  }

  const prompt = `Is this student answer correct or essentially correct? Be generous - if they capture the main idea even with different wording, mark it correct.

Question: ${question}
Correct answer: ${correctAnswer}
Student answer: ${studentAnswer}

Reply with JSON: {"correct": true/false, "feedback": "encouraging message if correct, helpful explanation if wrong"}`;

  try {
    const raw = await complete(prompt, 500);
    console.log("[lesson:check] raw preview:", raw.slice(0, 300));
    const parsed = extractJSON<{ correct?: unknown; feedback?: unknown }>(raw);
    const correct = parsed.correct === true;
    const feedback =
      typeof parsed.feedback === "string" && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : correct
        ? "nice — you got it."
        : "not quite — give it another shot.";
    return NextResponse.json({ correct, feedback });
  } catch (e) {
    console.error("[lesson:check] evaluation failed:", e);
    const lower = studentAnswer.toLowerCase();
    const correct = correctAnswer
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => lower.includes(w));
    return NextResponse.json({
      correct,
      feedback: correct
        ? "got the main idea — nice work."
        : "close but not quite — try rephrasing using a key concept from the lesson.",
      fallback: true,
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "check") {
      return evaluateAnswer(body);
    }

    const { topic, studentProfile } = body;
    const courseSlug =
      typeof body.courseSlug === "string"
        ? body.courseSlug.trim()
        : typeof body.courseName === "string"
        ? body.courseName.trim()
        : "";

    const previousAttempts: PreviousAttempt[] = Array.isArray(body.previousAttempts)
      ? (body.previousAttempts as PreviousAttempt[]).filter(
          (a) => a && typeof a === "object" && typeof a.conceptTested === "string"
        )
      : [];
    const failed = failedConcepts(previousAttempts);
    const reviewMode = failed.length > 0;

    if (!topic || !studentProfile) {
      return NextResponse.json(
        { error: "topic and studentProfile are required" },
        { status: 400 }
      );
    }
    if (!courseSlug) {
      return NextResponse.json(
        { error: "courseSlug is required — select a course first" },
        { status: 400 }
      );
    }

    console.log(
      `[lesson] topic=${topic} course=${courseSlug} mode=${
        reviewMode ? "review" : "fresh"
      } failed=[${failed.join(", ")}]`
    );

    const gbrainResults = await gbrainQuery(
      `${topic} explanation concepts examples`,
      { source: courseSlug }
    );

    const studentSlug = studentProfile.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");
    const shortTopic = topic.split(" ").slice(0, 3).join(" ");
    const pastProgress = await gbrainQuery(`student progress ${shortTopic}`, {
      source: undefined,
      timeoutMs: 10000,
    }).catch(() => "");
    console.log(
      `[lesson] past progress for ${studentSlug} (topic="${shortTopic}"): ${pastProgress.length} chars`
    );

    let lesson: LessonData | null = null;
    try {
      const primaryPrompt = reviewMode
        ? buildReviewPrompt(topic, studentProfile, gbrainResults, failed)
        : buildPrompt(topic, studentProfile, gbrainResults, pastProgress);

      lesson = await tryGenerateLesson(primaryPrompt, "primary");

      if (!lesson) {
        console.log("[lesson] primary failed — retrying with stricter prompt");
        lesson = await tryGenerateLesson(
          buildRetryPrompt(topic, studentProfile, gbrainResults),
          "retry"
        );
      }
    } catch (e) {
      console.error("[lesson] generation pipeline error:", e);
    }

    if (!lesson) {
      lesson = fallbackLesson(topic, studentProfile);
    }

    if (
      studentProfile.learningStyle === "visuals" &&
      lesson &&
      lesson.sections.length > 0
    ) {
      const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const sectionsToImage = lesson.sections.slice(0, 2);
      await Promise.all(
        sectionsToImage.map(async (section, i) => {
          try {
            const response = await openaiClient.responses.create({
              model: "gpt-5.5",
              input: `Generate a simple clean educational diagram illustrating: "${section.title}". Flat design, minimal, white background, bright colors, no text in image.`,
              tools: [{ type: "image_generation" }],
            });

            const imageData = response.output
              .filter((o: any) => o.type === "image_generation_call")
              .map((o: any) => o.result);

            if (imageData.length > 0) {
              section.imageUrl = `data:image/png;base64,${imageData[0]}`;
              console.log(`[lesson] image generated for section ${i}: ${section.title}`);
            }
          } catch (e) {
            console.warn("[lesson] image gen failed for section", i, e);
          }
        })
      );
    }

    return NextResponse.json({
      lesson,
      reviewMode,
      failedConcepts: failed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[lesson] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function fallbackLesson(
  topic: string,
  profile: { learningStyle?: string; skillLevel?: string }
): LessonData {
  const style = profile.learningStyle || "examples";
  return {
    sections: [
      {
        title: `Welcome to ${topic}`,
        content: `Let's start with the big picture of ${topic}. I've tuned this for a ${style}-first learner.`,
        type: "explanation",
      },
      {
        title: "Core idea",
        content: `At its heart, ${topic} is about taking something complex and breaking it down into pieces you can reason about one at a time.`,
        type: "explanation",
      },
      {
        title: "A concrete example",
        content: `Imagine you're explaining ${topic} to a friend over coffee. You'd start with a story, point at something familiar, and build from there.`,
        type: "example",
      },
      {
        title: "Going deeper",
        content: `Once the basic shape is clear, the next layer is about how the pieces connect and influence each other.`,
        type: "explanation",
      },
      {
        title: "Pulling it together",
        content: `The full mental model of ${topic} is one you build by reasoning through worked examples, not just reading definitions.`,
        type: "explanation",
      },
    ],
    checkpoints: [
      {
        id: "cp1",
        question: `In your own words, what's the main idea of ${topic}?`,
        correctAnswer: "breaking complex things into smaller pieces",
        hint: "Think about how we framed the core idea above.",
        conceptTested: "core-idea",
      },
      {
        id: "cp2",
        question: `Give one example where reasoning about ${topic} matters in practice.`,
        correctAnswer: "real-world application of the idea",
        hint: "Re-read the concrete example section.",
        conceptTested: "applied-example",
      },
      {
        id: "cp3",
        question: `How do the pieces of ${topic} connect to form a useful mental model?`,
        correctAnswer: "connections between pieces of the topic",
        hint: "Refer back to 'Going deeper' and 'Pulling it together'.",
        conceptTested: "synthesis",
      },
    ],
  };
}
