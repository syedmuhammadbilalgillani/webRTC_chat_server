import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/db";
import { blockedUsers } from "../db/schema";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { AppError } from "../middlewares/errorHandler";

const router = Router();
router.use(authMiddleware);

router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { blockedId } = req.body;
    if (!blockedId) throw new AppError("blockedId required", 400);
    if (blockedId === userId) throw new AppError("Cannot block yourself", 400);

    await db.insert(blockedUsers).values({
      blockerId: userId,
      blockedId,
    });

    res.status(201).json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.delete("/:userId", async (req: AuthRequest, res, next) => {
  try {
    const blockerId = req.user!.userId;
    const { userId } = req.params;

    await db
      .delete(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, blockerId),
          eq(blockedUsers.blockedId, userId)
        )
      );

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
