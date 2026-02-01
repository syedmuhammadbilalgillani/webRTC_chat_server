import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/db";
import { users, blockedUsers } from "../db/schema";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { AppError } from "../middlewares/errorHandler";

const router = Router();
router.use(authMiddleware);

router.get("/search", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const q = (req.query.q as string)?.trim();
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const blocked = await db
      .select({ blockedId: blockedUsers.blockedId })
      .from(blockedUsers)
      .where(eq(blockedUsers.blockerId, userId));
    const blockedIds = blocked.map((b) => b.blockedId);

    const list = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        status: users.status,
        isOnline: users.isOnline,
        lastSeen: users.lastSeen,
      })
      .from(users)
      .where(sql`${users.name} ILIKE ${"%" + q + "%"} AND ${users.id} != ${userId}`)
      .limit(30);

    const filtered = blockedIds.length
      ? list.filter((u) => !blockedIds.includes(u.id))
      : list;

    res.json({ users: filtered });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        status: users.status,
        isOnline: users.isOnline,
        lastSeen: users.lastSeen,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) throw new AppError("User not found", 404);

    const [blocked] = await db
      .select()
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, userId),
          eq(blockedUsers.blockedId, id)
        )
      )
      .limit(1);

    res.json({ ...user, isBlocked: Boolean(blocked) });
  } catch (e) {
    next(e);
  }
});

export default router;
