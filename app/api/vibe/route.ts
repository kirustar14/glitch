import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractJSON } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cachedClient;
}

function asMessageArray(parsed: unknown): string[] {
  if (Array.isArray(parsed)) {
    return parsed.filter((m): m is string => typeof m === "string" && m.trim().length > 0);
  }
  if (parsed && typeof parsed === "object") {
    for (const v of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        return v.filter((m): m is string => typeof m === "string" && m.trim().length > 0);
      }
    }
  }
  return [];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      studentName?: string;
      interests?: string;
      topic?: string;
      count?: number;
    };
    const { studentName, interests, topic } = body;
    const count = Math.min(Math.max(Number(body.count) || 10, 1), 20);

    if (!studentName || !interests || !topic) {
      return NextResponse.json(
        { error: "studentName, interests, and topic are required" },
        { status: 400 }
      );
    }

    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are Byte, a witty gremlin tutor mascot. Generate exactly ${count} unique funny loading messages for ${studentName} who loves ${interests}, waiting for their lesson on "${topic}" to load. Each message max 12 words. Connect ${interests} to learning in clever punny ways. Return ONLY a JSON array of strings, nothing else. Make each one different and progressively funnier.`,
        },
      ],
    });

    const first = response.content[0];
    if (!first || first.type !== "text") {
      return NextResponse.json(
        { messages: [], error: "no text content" },
        { status: 502 }
      );
    }

    let messages: string[] = [];
    try {
      const parsed = extractJSON<unknown>(first.text);
      messages = asMessageArray(parsed).map((m) =>
        m.trim().replace(/^["']|["']$/g, "")
      );
    } catch (e) {
      console.error("[vibe] JSON parse failed:", e, first.text.slice(0, 200));
    }

    if (messages.length === 0) {
      return NextResponse.json(
        { messages: [], error: "could not parse messages" },
        { status: 502 }
      );
    }

    return NextResponse.json({ messages });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[vibe] failed:", msg);
    return NextResponse.json({ messages: [], error: msg }, { status: 500 });
  }
}
