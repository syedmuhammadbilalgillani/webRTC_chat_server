import Expo from "expo-server-sdk";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { pushTokens } from "../db/schema";

const expo = new Expo();

export async function sendPushToUser(
  userId: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const tokens = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));

  const messages = tokens
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => ({
      to: t.token,
      sound: "default" as const,
      body,
      data: data ?? {},
    }));

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    await expo.sendPushNotificationsAsync(chunk);
  }
}
