import { handleAuth } from "../../lib/server/auth";

export default (req: Request) => handleAuth(req);
export const config = { path: "/api/auth" };
