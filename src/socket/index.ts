import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken, type AccessPayload } from "../lib/jwt";
import { getRedis } from "../lib/redis";
import config from "../config/config";

const TYPING_PREFIX = "typing:";
const PRESENCE_PREFIX = "presence:";
const SOCKET_USER_PREFIX = "socket:user:";

export function setupSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("Auth required"));

    try {
      const payload = verifyAccessToken(token) as AccessPayload;
      (socket as Socket & { userId: string }).userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (sock) => {
    const socket = sock as Socket & { userId: string };
    const userId = socket.userId;
    const redis = getRedis();

    socket.join(`user:${userId}`);

    const registerPresence = async () => {
      await redis.set(
        `${PRESENCE_PREFIX}${userId}`,
        socket.id,
        "EX",
        config.redis.presenceTtlSeconds
      );
      await redis.sadd(SOCKET_USER_PREFIX + userId, socket.id);
    };

    const joinConversationRooms = async () => {
      const { db } = await import("../db/db");
      const { conversationParticipants } = await import("../db/schema");
      const { eq } = await import("drizzle-orm");

      const parts = await db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.userId, userId));

      parts.forEach((p) => {
        socket.join(`conv:${p.conversationId}`);
      });
    };

    registerPresence()
      .then(() => joinConversationRooms())
      .catch(console.error);

    socket.on("typing:start", async (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      const key = `${TYPING_PREFIX}${data.conversationId}:${userId}`;
      await redis.set(key, "1", "EX", config.redis.typingTtlSeconds);
      socket.to(`conv:${data.conversationId}`).emit("typing:start", {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on("typing:stop", async (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      const key = `${TYPING_PREFIX}${data.conversationId}:${userId}`;
      await redis.del(key);
      socket.to(`conv:${data.conversationId}`).emit("typing:stop", {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on(
      "message:send",
      async (data: {
        conversationId: string;
        type: string;
        content?: string;
        replyToMessageId?: string;
        metadata?: Record<string, unknown>;
      }) => {
        const { handleMessageSend } = await import("./handlers");
        handleMessageSend(io, socket, data);
      }
    );

    socket.on("message:delivered", async (data: { messageId: string }) => {
      const { handleMessageDelivered } = await import("./handlers");
      handleMessageDelivered(io, socket, data);
    });

    socket.on("message:seen", async (data: { messageId: string; conversationId: string }) => {
      const { handleMessageSeen } = await import("./handlers");
      handleMessageSeen(io, socket, data);
    });

    socket.on("presence:update", async () => {
      await registerPresence();
      socket.broadcast.emit("presence:update", { userId, status: "online" });
    });

    socket.on("call:start", async (data: { conversationId: string; type: "audio" | "video" }) => {
      const { handleCallStart } = await import("./handlers");
      handleCallStart(io, socket, data);
    });

    socket.on("call:offer", async (data: { callId: string; targetUserId: string; offer: RTCSessionDescriptionInit }) => {
      io.to(`user:${data.targetUserId}`).emit("call:offer", {
        callId: data.callId,
        fromUserId: userId,
        offer: data.offer,
      });
    });

    socket.on("call:answer", async (data: { callId: string; targetUserId: string; answer: RTCSessionDescriptionInit }) => {
      io.to(`user:${data.targetUserId}`).emit("call:answer", {
        callId: data.callId,
        fromUserId: userId,
        answer: data.answer,
      });
    });

    socket.on("call:ice", async (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => {
      io.to(`user:${data.targetUserId}`).emit("call:ice", {
        fromUserId: userId,
        candidate: data.candidate,
      });
    });

    socket.on("call:end", async (data: { callId: string; targetUserIds?: string[] }) => {
      const { handleCallEnd } = await import("./handlers");
      handleCallEnd(io, socket, data);
    });

    socket.on("disconnect", async () => {
      await redis.srem(SOCKET_USER_PREFIX + userId, socket.id);
      const remaining = await redis.smembers(SOCKET_USER_PREFIX + userId);
      if (remaining.length === 0) {
        await redis.del(`${PRESENCE_PREFIX}${userId}`);
        socket.broadcast.emit("presence:update", {
          userId,
          status: "offline",
          lastSeen: new Date().toISOString(),
        });
      }
    });
  });

  return io;
}
