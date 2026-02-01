import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/db";
import {
  calls,
  callParticipants,
  conversations,
  conversationParticipants,
} from "../db/schema";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { AppError } from "../middlewares/errorHandler";

const router = Router();
router.use(authMiddleware);

router.get("/history/:conversationId", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { conversationId } = req.params;

    const part = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ),
    });
    if (!part) throw new AppError("Conversation not found", 404);

    const callHistory = await db
      .select()
      .from(calls)
      .where(eq(calls.conversationId, conversationId))
      .orderBy(desc(calls.createdAt))
      .limit(50);

    res.json({ calls: callHistory });
  } catch (e) {
    next(e);
  }
});

export default router;
