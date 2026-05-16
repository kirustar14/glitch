import { NextResponse } from "next/server";
import { gbrainQuery } from "@/lib/gbrain";
import { complete } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message, studentProfile, context } = await req.json();
    if (!message || !studentProfile) {
      return NextResponse.json(
        { error: "message and studentProfile are required" },
        { status: 400 }
      );
    }

    const ragContext = await gbrainQuery(message);

    const prompt = `You are Byte, a friendly, warm, slightly playful adaptive tutor.

Student profile: ${JSON.stringify(studentProfile)}
Current lesson context: ${context || "(none)"}
Course material (from GBrain RAG): ${ragContext}

Student says: "${message}"

Respond as Byte. Match their learning style (${studentProfile.learningStyle}), respect their level (${studentProfile.skillLevel}), and keep response length ${studentProfile.lessonLength}. Be encouraging and concrete. Plain text, no markdown headings.`;

    const response = await complete(prompt, 800);
    return NextResponse.json({ response });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
