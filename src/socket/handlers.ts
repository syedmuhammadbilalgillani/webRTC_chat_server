import { Server } from "socket.io";
import { Socket } from "socket.io";
import { eq, and } from "drizzle-orm";
import { db } from "../db/db";
import {
  messages,
  messageStatus,
  conversationParticipants,
  conversations,
  calls,
  callParticipants,
} from "../db/schema";

interface AuthedSocket extends Socket {
  userId: string;
}

export async function handleMessageSend(
  io: Server,
  socket: AuthedSocket,
  data: {
    conversationId: string;
    type: string;
    content?: string;
    replyToMessageId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const userId = socket.userId;
  const { conversationId, type, content, replyToMessageId, metadata } = data;

  if (!conversationId || !type) return;

  const part = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId)
    ),
  });

  if (!part) return;

  const msgType = (
    ["text", "image", "video", "audio", "file", "system"].includes(type || "text")
      ? (type || "text")
      : "text"
  ) as "text" | "image" | "video" | "audio" | "file" | "system";
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      senderId: userId,
      type: msgType,
      content: content ?? null,
      replyToMessageId: replyToMessageId ?? null,
      metadata: metadata ?? null,
    })
    .returning();

  if (!msg) return;

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

  io.to(`conv:${conversationId}`).emit("message:receive", msg);
}

export async function handleMessageDelivered(
  io: Server,
  socket: AuthedSocket,
  data: { messageId: string }
) {
  const userId = socket.userId;
  const { messageId } = data;
  if (!messageId) return;

  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });
  if (!msg) return;

  const existing = await db.query.messageStatus.findFirst({
    where: and(
      eq(messageStatus.messageId, messageId),
      eq(messageStatus.userId, userId)
    ),
  });
  if (existing) {
    await db
      .update(messageStatus)
      .set({ status: "delivered", updatedAt: new Date() })
      .where(
        and(
          eq(messageStatus.messageId, messageId),
          eq(messageStatus.userId, userId)
        )
      );
  } else {
    await db.insert(messageStatus).values({
      messageId,
      userId,
      status: "delivered",
    });
  }

  io.to(`conv:${msg.conversationId}`).emit("message:delivered", {
    messageId,
    userId,
  });
}

export async function handleMessageSeen(
  io: Server,
  socket: AuthedSocket,
  data: { messageId: string; conversationId: string }
) {
  const userId = socket.userId;
  const { messageId, conversationId } = data;
  if (!messageId || !conversationId) return;

  await db
    .update(conversationParticipants)
    .set({ lastReadMessageId: messageId })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    );

  const existingStatus = await db.query.messageStatus.findFirst({
    where: and(
      eq(messageStatus.messageId, messageId),
      eq(messageStatus.userId, userId)
    ),
  });
  if (existingStatus) {
    await db
      .update(messageStatus)
      .set({ status: "seen", updatedAt: new Date() })
      .where(
        and(
          eq(messageStatus.messageId, messageId),
          eq(messageStatus.userId, userId)
        )
      );
  } else {
    await db.insert(messageStatus).values({
      messageId,
      userId,
      status: "seen",
    });
  }

  io.to(`conv:${conversationId}`).emit("message:seen", {
    messageId,
    userId,
    lastReadMessageId: messageId,
  });
}

export async function handleCallStart(
  io: Server,
  socket: AuthedSocket,
  data: { conversationId: string; type: "audio" | "video" }
) {
  const userId = socket.userId;
  const { conversationId, type } = data;
  if (!conversationId || !type) return;

  const [call] = await db
    .insert(calls)
    .values({
      conversationId,
      callerId: userId,
      type,
      status: "ringing",
    })
    .returning();

  if (!call) return;

  await db.insert(callParticipants).values({
    callId: call.id,
    userId,
    joinedAt: new Date(),
  });

  io.to(`conv:${conversationId}`).emit("call:start", {
    callId: call.id,
    callerId: userId,
    conversationId,
    type,
    status: "ringing",
  });
}

export async function handleCallEnd(
  io: Server,
  socket: AuthedSocket,
  data: { callId: string; targetUserIds?: string[] }
) {
  const { callId, targetUserIds } = data;
  if (!callId) return;

  const call = await db.query.calls.findFirst({
    where: eq(calls.id, callId),
  });
  if (!call) return;

  await db
    .update(calls)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(calls.id, callId));

  if (targetUserIds?.length) {
    targetUserIds.forEach((uid) => {
      io.to(`user:${uid}`).emit("call:end", { callId });
    });
  } else {
    io.to(`conv:${call.conversationId}`).emit("call:end", { callId });
  }
}
