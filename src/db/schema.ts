import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/* ======================================================
   ENUM TYPES (logical enums, enforced at app level)
====================================================== */

export const MessageTypes = [
  "text",
  "image",
  "video",
  "audio",
  "file",
  "system",
] as const;

export const ConversationTypes = ["private", "group"] as const;

export const MessageDeliveryStatus = [
  "sent",
  "delivered",
  "seen",
] as const;

export const CallTypes = ["audio", "video"] as const;

export const CallStatuses = [
  "ringing",
  "ongoing",
  "ended",
  "missed",
] as const;

/* ======================================================
   USERS
====================================================== */

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: varchar("name", { length: 100 }).notNull(),
  avatar: text("avatar"),

  status: varchar("status", { length: 150 }), // "Available"

  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* ======================================================
   AUTH CREDENTIALS (for JWT login - extends users)
====================================================== */

export const authCredentials = pgTable("auth_credentials", {
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .primaryKey(),

  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),

  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* ======================================================
   CONVERSATIONS
====================================================== */

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),

  type: varchar("type", { length: 10 })
    .$type<(typeof ConversationTypes)[number]>()
    .notNull(),

  title: varchar("title", { length: 150 }),
  avatar: text("avatar"),

  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),

  lastMessageId: uuid("last_message_id"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* ======================================================
   CONVERSATION PARTICIPANTS
====================================================== */

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .references(() => conversations.id)
      .notNull(),

    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),

    role: varchar("role", { length: 20 }).default("member"), // admin | member

    isMuted: boolean("is_muted").default(false),
    isArchived: boolean("is_archived").default(false),

    lastReadMessageId: uuid("last_read_message_id"),

    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userIdx: index("idx_participants_user").on(t.userId),
  })
);

/* ======================================================
   MESSAGES
====================================================== */

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    conversationId: uuid("conversation_id")
      .references(() => conversations.id)
      .notNull(),

    senderId: uuid("sender_id")
      .references(() => users.id)
      .notNull(),

    type: varchar("type", { length: 10 })
      .$type<(typeof MessageTypes)[number]>()
      .notNull(),

    content: text("content"), // text OR media URL

    replyToMessageId: uuid("reply_to_message_id"),

    metadata: jsonb("metadata"),
    // { duration, waveform, width, height, size }

    isEdited: boolean("is_edited").default(false),
    isDeleted: boolean("is_deleted").default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => ({
    conversationIdx: index("idx_messages_conversation").on(
      t.conversationId
    ),
    createdIdx: index("idx_messages_created").on(t.createdAt),
  })
);

/* ======================================================
   MESSAGE DELIVERY & SEEN
====================================================== */

export const messageStatus = pgTable(
  "message_status",
  {
    messageId: uuid("message_id")
      .references(() => messages.id)
      .notNull(),

    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),

    status: varchar("status", { length: 20 })
      .$type<(typeof MessageDeliveryStatus)[number]>()
      .notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    messageIdx: index("idx_message_status_message").on(t.messageId),
  })
);

/* ======================================================
   MESSAGE REACTIONS
====================================================== */

export const messageReactions = pgTable("message_reactions", {
  messageId: uuid("message_id")
    .references(() => messages.id)
    .notNull(),

  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),

  emoji: varchar("emoji", { length: 10 }).notNull(),

  reactedAt: timestamp("reacted_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* ======================================================
   PINNED MESSAGES
====================================================== */

export const pinnedMessages = pgTable("pinned_messages", {
  conversationId: uuid("conversation_id")
    .references(() => conversations.id)
    .notNull(),

  messageId: uuid("message_id")
    .references(() => messages.id)
    .notNull(),

  pinnedBy: uuid("pinned_by")
    .references(() => users.id)
    .notNull(),

  pinnedAt: timestamp("pinned_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* ======================================================
   BLOCKED USERS
====================================================== */

export const blockedUsers = pgTable("blocked_users", {
  blockerId: uuid("blocker_id")
    .references(() => users.id)
    .notNull(),

  blockedId: uuid("blocked_id")
    .references(() => users.id)
    .notNull(),

  blockedAt: timestamp("blocked_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* ======================================================
   CALLS (AUDIO / VIDEO)
====================================================== */

export const calls = pgTable("calls", {
  id: uuid("id").defaultRandom().primaryKey(),

  conversationId: uuid("conversation_id")
    .references(() => conversations.id)
    .notNull(),

  callerId: uuid("caller_id")
    .references(() => users.id)
    .notNull(),

  type: varchar("type", { length: 10 })
    .$type<(typeof CallTypes)[number]>()
    .notNull(),

  status: varchar("status", { length: 20 })
    .$type<(typeof CallStatuses)[number]>()
    .notNull(),

  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* ======================================================
   CALL PARTICIPANTS
====================================================== */

export const callParticipants = pgTable("call_participants", {
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),

  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),

  joinedAt: timestamp("joined_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
});

/* ======================================================
   PUSH TOKENS (Expo Push Notifications)
====================================================== */

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    token: text("token").notNull().unique(),
    platform: varchar("platform", { length: 20 }), // ios | android
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userIdx: index("idx_push_tokens_user").on(t.userId),
  })
);
