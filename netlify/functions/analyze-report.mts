import { handleAnalyze } from "../../lib/ai/analyze-handler";

export default (req: Request) => handleAnalyze(req);
export const config = { path: "/api/analyze-report" };
