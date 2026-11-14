import { handle } from "@/lib/http/handle";
import { listReviewQueue } from "@/lib/services/reports";

export async function GET() {
  return handle(async ({ repo }) => ({ reports: await listReviewQueue(repo) }));
}
