import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

const GBRAIN_BIN = "/Users/kiruthika/.bun/bin/gbrain";

function childEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    PATH: `${process.env.PATH ?? ""}:/Users/kiruthika/.bun/bin:/opt/homebrew/bin`,
  };
}

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "student"
  );
}

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

async function gbrainGet(path: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `${GBRAIN_BIN} get ${path} 2>/dev/null`,
      { timeout: 15_000, maxBuffer: 10 * 1024 * 1024, env: childEnv() }
    );
    return stdout;
  } catch {
    return "";
  }
}

async function gbrainPut(path: string, contentFile: string) {
  return execAsync(`${GBRAIN_BIN} put ${path} < ${contentFile}`, {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    env: childEnv(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      studentName,
      courseSlug,
      topic,
      question,
      answer,
      correct,
      hint,
      conceptTested,
    } = body as {
      studentName?: string;
      courseSlug?: string;
      topic?: string;
      question?: string;
      answer?: string;
      correct?: boolean;
      hint?: string;
      conceptTested?: string;
    };

    if (!studentName || !topic || !question || typeof correct !== "boolean") {
      return NextResponse.json(
        { error: "studentName, topic, question, and correct are required" },
        { status: 400 }
      );
    }

    const slug = slugifyName(studentName);
    const path = `students/${slug}-progress`;
    const date = formatTimestamp();

    const lines = [
      `## ${topic} — ${date}`,
      `- Course: ${courseSlug || "(unspecified)"}`,
      `- Concept: ${conceptTested || "(unspecified)"}`,
      `- Question: ${question}`,
      `- Answer: ${answer ?? ""}`,
      `- Result: ${correct ? "correct" : "incorrect"}`,
    ];
    if (!correct && hint) {
      lines.push(`- Note: ${hint}`);
    }
    const newEntry = lines.join("\n") + "\n";

    const existing = (await gbrainGet(path)).trim();
    const header = `# ${studentName}'s Progress\n`;
    const combined = existing
      ? `${existing}\n\n${newEntry}`
      : `${header}\n${newEntry}`;

    const tmpFile = `/tmp/glitch-checkpoint-${Date.now()}.md`;
    await writeFile(tmpFile, combined);
    await gbrainPut(path, tmpFile);

    console.log(
      `[checkpoint] saved ${correct ? "✓" : "✗"} for ${studentName} on "${topic}" (concept=${conceptTested ?? "?"})`
    );

    return NextResponse.json({ success: true, path });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[checkpoint] failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
