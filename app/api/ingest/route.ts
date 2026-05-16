import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const execAsync = promisify(exec);

const GBRAIN_BIN = "/Users/kiruthika/.bun/bin/gbrain";
const PYTHON_BIN = "/opt/anaconda3/bin/python3";

function childEnv(extras: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    PATH: `${process.env.PATH ?? ""}:/Users/kiruthika/.bun/bin:/opt/homebrew/bin`,
    ...extras,
  };
}

async function run(
  label: string,
  cmd: string,
  timeoutMs: number,
  extraEnv: NodeJS.ProcessEnv = {}
) {
  console.log(`[ingest:${label}] $ ${cmd}`);
  const { stdout, stderr } = await execAsync(cmd, {
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    env: childEnv(extraEnv),
  });
  if (stderr) console.log(`[ingest:${label}] stderr:`, stderr.slice(0, 500));
  if (stdout) console.log(`[ingest:${label}] stdout:`, stdout.slice(0, 500));
  return { stdout, stderr };
}

function makeSlug(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const root = cleaned || "course";
  return `${root}-${Date.now().toString(36)}`;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json({ error: "file must be a PDF" }, { status: 400 });
    }

    const slug = makeSlug(file.name);
    const uploadDir = `/tmp/glitch-uploads/${slug}`;
    await mkdir(uploadDir, { recursive: true });

    const pdfPath = path.join(uploadDir, `${slug}.pdf`);
    const mdPath = path.join(uploadDir, `${slug}.md`);

    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(pdfPath, buf);
    console.log(`[ingest] saved ${buf.length} bytes to ${pdfPath} (slug=${slug})`);

    await run(
      "pdf2md",
      `${PYTHON_BIN} -c "import pymupdf4llm; md = pymupdf4llm.to_markdown('${pdfPath}'); open('${mdPath}', 'w').write(md)"`,
      120_000
    );

    await run(
      "import",
      `${GBRAIN_BIN} import ${uploadDir} --source-id ${slug} --no-embed`,
      120_000,
      { GBRAIN_SOURCE: slug }
    );

    await run(
      "embed",
      `${GBRAIN_BIN} embed --stale`,
      240_000,
      { GBRAIN_SOURCE: slug }
    );

    return NextResponse.json({
      success: true,
      slug,
      originalFilename: file.name,
      uploadDir,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[ingest] failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
