import { requireRepair, requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ repairId: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const repair = await requireRepair(user.id, (await params).repairId);
  return json({ repair });
});
