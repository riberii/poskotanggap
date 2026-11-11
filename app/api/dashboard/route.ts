import { handle } from "@/lib/http/handle";
import { getDashboard } from "@/lib/services/reports";

export async function GET() {
  return handle(async ({ repo }) => getDashboard(repo));
}
