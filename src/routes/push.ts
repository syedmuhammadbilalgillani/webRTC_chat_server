import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/db";
import { pushTokens } from "../db/schema";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { AppError } from "../middlewares/errorHandler";

const router = Router();
router.use(authMiddleware);

router.post("/register", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { token, platform } = req.body;

    if (!token) throw new AppError("token required", 400);

    await db
      .insert(pushTokens)
      .values({
        userId,
        token: String(token),
        platform: platform || null,
      })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, platform: platform || null },
      });

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.delete("/", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { token } = req.body;

    if (!token) throw new AppError("token required", 400);

    await db
      .delete(pushTokens)
      .where(
        and(
          eq(pushTokens.token, String(token)),
          eq(pushTokens.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
