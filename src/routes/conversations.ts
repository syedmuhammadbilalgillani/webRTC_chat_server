import { Router } from "express";
import { eq, and, desc, inArray, ne } from "drizzle-orm";
import { db } from "../db/db";
import {
  conversations,
  conversationParticipants,
  messages,
  users,
} from "../db/schema";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { AppError } from "../middlewares/errorHandler";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;

    const participantRows = await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId))
      .orderBy(desc(conversationParticipants.joinedAt));

    const convIds = participantRows.map((p) => p.conversationId);

    if (convIds.length === 0) {
      return res.json({ conversations: [] });
    }

    const convList = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, convIds));

    const lastMsgIds = convList
      .map((c) => c.lastMessageId)
      .filter(Boolean) as string[];

    let lastMessages: Record<string, typeof messages.$inferSelect> = {};
    if (lastMsgIds.length > 0) {
      const msgs = await db
        .select()
        .from(messages)
        .where(inArray(messages.id, lastMsgIds));
      msgs.forEach((m) => (lastMessages[m.id] = m));
    }

    // For private convs, fetch other participant's name
    const privateConvIds = convList
      .filter((c) => c.type === "private")
      .map((c) => c.id);
    let otherParticipants: Record<string, string> = {};
    if (privateConvIds.length > 0) {
      const others = await db
        .select({
          conversationId: conversationParticipants.conversationId,
          name: users.name,
        })
        .from(conversationParticipants)
        .innerJoin(users, eq(users.id, conversationParticipants.userId))
        .where(
          and(
            inArray(conversationParticipants.conversationId, privateConvIds),
            ne(conversationParticipants.userId, userId)
          )
        );
      others.forEach((o) => (otherParticipants[o.conversationId] = o.name));
    }

    const result = convList.map((conv) => {
      const part = participantRows.find((p) => p.conversationId === conv.id)!;
      const lastMsg = conv.lastMessageId
        ? lastMessages[conv.lastMessageId]
        : null;
      const displayTitle =
        conv.type === "private"
          ? otherParticipants[conv.id] || conv.title || "Unknown"
          : conv.title;
      return {
        id: conv.id,
        type: conv.type,
        title: displayTitle,
        avatar: conv.avatar,
        isMuted: part.isMuted,
        isArchived: part.isArchived,
        lastReadMessageId: part.lastReadMessageId,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              type: lastMsg.type,
              content: lastMsg.content,
              senderId: lastMsg.senderId,
              createdAt: lastMsg.createdAt,
            }
          : null,
        lastMessageAt: conv.lastMessageAt,
      };
    });

    res.json({ conversations: result });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { type, participantIds, title } = req.body;

    if (!type || !participantIds || !Array.isArray(participantIds)) {
      throw new AppError("type and participantIds required", 400);
    }

    const name = title || null;
    const [conv] = await db
      .insert(conversations)
      .values({
        type: type === "group" ? "group" : "private",
        title: name,
        createdBy: userId,
      })
      .returning();

    if (!conv) throw new AppError("Failed to create conversation", 500);

    const allUserIds = [...new Set([userId, ...participantIds])];
    await db.insert(conversationParticipants).values(
      allUserIds.map((uid) => ({
        conversationId: conv.id,
        userId: uid,
        role: uid === userId ? "admin" : "member",
      }))
    );

    res.status(201).json(conv);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const part = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, id),
        eq(conversationParticipants.userId, userId)
      ),
    });

    if (!part) throw new AppError("Conversation not found", 404);

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    });
    if (!conv) throw new AppError("Conversation not found", 404);

    const participants = await db
      .select({
        userId: conversationParticipants.userId,
        role: conversationParticipants.role,
        user: users,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(eq(conversationParticipants.conversationId, id));

    res.json({
      ...conv,
      participants: participants.map((p) => ({
        userId: p.userId,
        role: p.role,
        name: p.user.name,
        avatar: p.user.avatar,
      })),
      isMuted: part.isMuted,
      isArchived: part.isArchived,
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/mute", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { muted } = req.body;

    await db
      .update(conversationParticipants)
      .set({ isMuted: Boolean(muted) })
      .where(
        and(
          eq(conversationParticipants.conversationId, id),
          eq(conversationParticipants.userId, userId)
        )
      );

    res.json({ muted: Boolean(muted) });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/archive", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { archived } = req.body;

    await db
      .update(conversationParticipants)
      .set({ isArchived: Boolean(archived) })
      .where(
        and(
          eq(conversationParticipants.conversationId, id),
          eq(conversationParticipants.userId, userId)
        )
      );

    res.json({ archived: Boolean(archived) });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/leave", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    await db
      .delete(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, id),
          eq(conversationParticipants.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
