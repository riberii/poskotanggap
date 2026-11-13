import { handle, readJson } from "@/lib/http/handle";
import { submitReport } from "@/lib/services/reports";

export async function POST(request: Request) {
  return handle(async ({ repo }) => submitReport(repo, await readJson(request)), 201);
}
