import { handle, readJson } from "@/lib/http/handle";
import { upsertInventory } from "@/lib/services/reports";

export async function PUT(request: Request) {
  return handle(async ({ repo }) => upsertInventory(repo, await readJson(request)));
}
