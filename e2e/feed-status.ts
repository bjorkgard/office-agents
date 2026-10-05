import type { APIRequestContext, TestInfo } from "@playwright/test";
import { feedStatusAttachment } from "./support.ts";

/** afterEach hook body: on a failed test, attach this project's `/__office/status` as `feed-status`. */
export async function attachFeedStatus(request: APIRequestContext, info: TestInfo): Promise<void> {
  if (info.status === info.expectedStatus) return;
  const port = (info.project.metadata as { port?: number }).port;
  const a = await feedStatusAttachment(async () => {
    const res = await request.get(`http://localhost:${port}/__office/status`, { timeout: 2000 });
    return { status: res.status(), body: await res.text() };
  });
  await info.attach(a.name, { body: a.body, contentType: a.contentType });
}
