import { createHash, randomUUID } from "node:crypto";

export function createJobId() {
  return `job_${randomUUID()}`;
}

export function createSandboxName(jobId: string) {
  const digest = createHash("sha256").update(jobId).digest("hex").slice(0, 12);
  return `exec-${digest}`;
}
