import * as path from "node:path";

/**
 * Base home for interference data (`~/.interference`).
 *
 * `INTERFERENCE_HOME` redirects the entire app store: used by tests to
 * isolate from the user's real directory, so no test can write or delete
 * real data (sessions, snapshots, credentials, skills, update cache).
 *
 * All consumers of `~/.interference` MUST go through here — do not
 * recompute the home manually (see store/skills/auth/version).
 */
export function interferenceHome(): string {
  return (
    process.env.INTERFERENCE_HOME ??
    process.env.HOME ??
    process.env.USERPROFILE ??
    "/tmp"
  );
}

/** Path inside `~/.interference` (or the home redirected by INTERFERENCE_HOME). */
export function interferenceDir(...segments: string[]): string {
  return path.join(interferenceHome(), ".interference", ...segments);
}
