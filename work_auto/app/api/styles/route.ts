import { handle, readJson } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";
import type { UserStyleInput } from "@/lib/types";

/** GET /api/styles */
export async function GET() {
  return handle(() => memoryService.listStyles());
}

/** POST /api/styles */
export async function POST(request: Request) {
  return handle(async () => memoryService.createStyle(await readJson<UserStyleInput>(request)));
}
