import { Router } from "express";
import { eq, and, desc, inArray, lt } from "drizzle-orm";
import { db } from "../db/db";
import {
  messages,
  messageStatus,
  messageReactions,
  pinnedMessages,
  conversationParticipants,
  conversations,
  users,
} from "../db/schema";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { AppError } from "../middlewares/errorHandler";

const router = Router();
router.use(authMiddleware);

router.get("/conversation/:conversationId", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { conversationId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before as string | undefined;

    const part = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ),
    });

    if (!part) throw new AppError("Conversation not found", 404);

    const conditions = [
      eq(messages.conversationId, conversationId),
      eq(messages.isDeleted, false),
    ];
    if (before) {
      conditions.push(lt(messages.createdAt, new Date(before)));
    }

    const all = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);

    const hasMore = all.length > limit;
    const msgs = all.slice(0, limit);

    const msgIds = msgs.map((m) => m.id);
    const statuses =
      msgIds.length > 0
        ? await db
            .select()
            .from(messageStatus)
            .where(inArray(messageStatus.messageId, msgIds))
        : [];
    const reactions =
      msgIds.length > 0
        ? await db
            .select()
            .from(messageReactions)
            .where(inArray(messageReactions.messageId, msgIds))
        : [];

    const senderIds = [...new Set(msgs.map((m) => m.senderId))];
    const senders =
      senderIds.length > 0
        ? await db
            .select({ id: users.id, name: users.name, avatar: users.avatar })
            .from(users)
            .where(inArray(users.id, senderIds))
        : [];

    const senderMap = Object.fromEntries(senders.map((s) => [s.id, s]));

    const payload = msgs.reverse().map((m) => {
      const msgStatuses = statuses.filter((s) => s.messageId === m.id);
      const msgReactions = reactions.filter((r) => r.messageId === m.id);
      return {
        ...m,
        sender: senderMap[m.senderId],
        statuses: msgStatuses,
        reactions: msgReactions,
      };
    });

    res.json({ messages: payload, hasMore });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { conversationId, type, content, replyToMessageId, metadata } =
      req.body;

    if (!conversationId || !type) {
      throw new AppError("conversationId and type required", 400);
    }

    const part = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ),
    });
    if (!part) throw new AppError("Conversation not found", 404);

    const [msg] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId: userId,
        type: type || "text",
        content: content ?? null,
        replyToMessageId: replyToMessageId ?? null,
        metadata: metadata ?? null,
      })
      .returning();

    if (!msg) throw new AppError("Failed to create message", 500);

    await db.insert(messageStatus).values({
      messageId: msg.id,
      userId,
      status: "sent",
    });

    await db
      .update(conversations)
      .set({
        lastMessageId: msg.id,
        lastMessageAt: msg.createdAt,
      })
      .where(eq(conversations.id, conversationId));

    res.status(201).json(msg);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { content } = req.body;

    const msg = await db.query.messages.findFirst({
      where: eq(messages.id, id),
    });
    if (!msg) throw new AppError("Message not found", 404);
    if (msg.senderId !== userId) throw new AppError("Forbidden", 403);

    const [updated] = await db
      .update(messages)
      .set({
        content: content ?? msg.content,
        isEdited: true,
        editedAt: new Date(),
      })
      .where(eq(messages.id, id))
      .returning();

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const msg = await db.query.messages.findFirst({
      where: eq(messages.id, id),
    });
    if (!msg) throw new AppError("Message not found", 404);
    if (msg.senderId !== userId) throw new AppError("Forbidden", 403);

    await db
      .update(messages)
      .set({ isDeleted: true, content: null })
      .where(eq(messages.id, id));

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/react", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { emoji } = req.body;

    if (!emoji) throw new AppError("emoji required", 400);

    const msg = await db.query.messages.findFirst({
      where: eq(messages.id, id),
    });
    if (!msg) throw new AppError("Message not found", 404);

    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, id),
          eq(messageReactions.userId, userId)
        )
      );
    await db.insert(messageReactions).values({
      messageId: id,
      userId,
      emoji: String(emoji).slice(0, 10),
    });

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/pin", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const msg = await db.query.messages.findFirst({
      where: eq(messages.id, id),
    });
    if (!msg) throw new AppError("Message not found", 404);

    await db.insert(pinnedMessages).values({
      conversationId: msg.conversationId,
      messageId: id,
      pinnedBy: userId,
    });

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.patch("/:conversationId/read", async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { conversationId } = req.params;
    const { lastReadMessageId } = req.body;

    if (!lastReadMessageId) {
      throw new AppError("lastReadMessageId required", 400);
    }

    await db
      .update(conversationParticipants)
      .set({ lastReadMessageId })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
