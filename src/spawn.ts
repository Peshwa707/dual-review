const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const SIGKILL_GRACE_MS = 2_000;

export interface BoundedResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SpawnOpts {
  timeoutMs: number;
  maxOutputBytes?: number;
  cwd?: string;
  /** Environment for the child. Defaults to the parent's environment when omitted. */
  env?: Record<string, string | undefined>;
}

/** Spawns a child process, injectable so callers can be tested without real processes. */
export type Spawner = (argv: string[], opts: SpawnOpts) => Promise<BoundedResult>;

/** OS/runtime vars every child needs; everything else (including unrelated secrets) is dropped. */
const BASE_ENV_KEYS = [
  "PATH",
  "HOME",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "SHELL",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
];

/**
 * Build a least-privilege child environment: OS essentials plus the caller's explicit
 * passthrough keys, and nothing else. This drops inherited environment VARIABLES (unrelated
 * secrets, CLAUDECODE) — it does NOT isolate the filesystem: HOME is retained, so on-disk
 * credentials (~/.aws, ~/.codex/auth.json, ~/.config) stay reachable until FS sandboxing lands.
 */
export function allowlistedEnv(passthrough: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [...BASE_ENV_KEYS, ...passthrough]) {
    const v = process.env[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Read a stream to completion but retain at most maxBytes (keeps draining so the pipe never blocks). */
async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let stored = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && stored < maxBytes) {
      // Truncate the boundary chunk so retained output never exceeds maxBytes.
      const slice = value.length <= maxBytes - stored ? value : value.subarray(0, maxBytes - stored);
      chunks.push(slice);
      stored += slice.length;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Run a command bounded by a wall-clock timeout (SIGTERM, then SIGKILL after a grace
 * period) and a capped output buffer. The single spawn primitive shared by the runtime
 * gate and the vendor adapters.
 */
export const spawnBounded: Spawner = async (argv, opts) => {
  const maxBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  // Omit `env` entirely when not overriding — passing `env: undefined` gives Bun an EMPTY
  // environment, which silently breaks inheritance. Only set it for an explicit override.
  const proc = opts.env
    ? Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", cwd: opts.cwd, env: opts.env })
    : Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", cwd: opts.cwd });

  let timedOut = false;
  const term = setTimeout(() => {
    timedOut = true;
    proc.kill(); // SIGTERM
  }, opts.timeoutMs);
  const kill = setTimeout(() => proc.kill(9), opts.timeoutMs + SIGKILL_GRACE_MS); // SIGKILL escalation

  try {
    const [stdout, stderr] = await Promise.all([
      readCapped(proc.stdout, maxBytes),
      readCapped(proc.stderr, maxBytes),
    ]);
    await proc.exited;
    return { exitCode: proc.exitCode, stdout, stderr, timedOut };
  } finally {
    clearTimeout(term);
    clearTimeout(kill);
  }
};
