import { handle, readJson } from "@/lib/http/handle";
import { getReportDetail, reviewReport } from "@/lib/services/reports";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return handle(async ({ repo }) => getReportDetail(repo, id));
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  return handle(async ({ repo }) => reviewReport(repo, id, await readJson(request)));
}
