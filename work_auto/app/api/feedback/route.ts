import { handle, readJson } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";
import type { UserFeedbackInput } from "@/lib/types";

/** GET /api/feedback */
export async function GET() {
  return handle(() => memoryService.listFeedback());
}

/** POST /api/feedback { contentId, rating, reason?, editedOutput? } */
export async function POST(request: Request) {
  return handle(async () => memoryService.addFeedback(await readJson<UserFeedbackInput>(request)));
}
