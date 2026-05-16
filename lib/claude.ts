import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

export function getClient(): Anthropic {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  cached = new Anthropic({ apiKey: key });
  return cached;
}

export const MODEL = "claude-sonnet-4-6";

export async function complete(prompt: string, maxTokens = 2048): Promise<string> {
  const client = getClient();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const part = res.content.find((c) => c.type === "text");
  return part && part.type === "text" ? part.text : "";
}

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export function extractJSON<T = unknown>(raw: string): T {
  const trimmed = raw.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  const direct = tryParse(candidate);
  if (direct !== undefined) return direct as T;

  const firstBracket = candidate.indexOf("[");
  const lastBracket = candidate.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const sliced = candidate.slice(firstBracket, lastBracket + 1);
    const parsed = tryParse(sliced);
    if (parsed !== undefined) return parsed as T;
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = candidate.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(sliced);
    if (parsed !== undefined) return parsed as T;
  }

  throw new Error("could not parse JSON from model output");
}

export function unwrapArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(v)) return v as T[];
    }
  }
  throw new Error("expected an array in model output");
}
