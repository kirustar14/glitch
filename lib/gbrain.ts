import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const GBRAIN_BIN = "/Users/kiruthika/.bun/bin/gbrain";

type QueryOpts = {
  source?: string;
  timeoutMs?: number;
};

export async function gbrainQuery(
  query: string,
  opts: QueryOpts | number = {}
): Promise<string> {
  const o: QueryOpts = typeof opts === "number" ? { timeoutMs: opts } : opts;
  const source = (o.source ?? process.env.GBRAIN_SOURCE ?? "").trim();
  const safe = query.replace(/"/g, '\\"');
  const sourceFlag = source ? ` --source-id ${source}` : "";

  try {
    const { stdout } = await execAsync(
      `timeout 40 ${GBRAIN_BIN} query "${safe}"${sourceFlag} 2>/dev/null || echo ""`,
      {
        timeout: o.timeoutMs ?? 45_000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
          GBRAIN_SOURCE: source,
          PATH: `${process.env.PATH ?? ""}:/Users/kiruthika/.bun/bin:/opt/homebrew/bin`,
        },
      }
    );
    return stdout.trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gbrain] query failed:", msg);
    return "";
  }
}
