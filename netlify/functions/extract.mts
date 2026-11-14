import { handleExtract } from "../../lib/ai/extract-handler";

export default (req: Request) => handleExtract(req);
export const config = { path: "/api/extract" };
