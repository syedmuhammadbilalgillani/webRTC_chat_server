# Socket.IO Events

All events require authentication via `auth: { token: "<accessToken>" }` in the connection handshake.

## Message Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `message:send` | Client → Server | `{ conversationId, type, content?, replyToMessageId?, metadata? }` | Send a new message. Server persists and broadcasts `message:receive`. |
| `message:receive` | Server → Client | Full message object | New message (broadcast to conversation room). |
| `message:delivered` | Both | `{ messageId, userId? }` | Mark message as delivered. |
| `message:seen` | Both | `{ messageId, conversationId, userId?, lastReadMessageId? }` | Mark message as seen; updates `lastReadMessageId`. |

## Typing Events (Redis TTL, not stored)

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `typing:start` | Client → Server | `{ conversationId }` | User started typing. Server stores in Redis (5s TTL) and broadcasts. |
| `typing:stop` | Client → Server | `{ conversationId }` | User stopped typing. |

## Presence

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `presence:update` | Server → Client | `{ userId, status, lastSeen? }` | User came online/offline. |

## WebRTC Signaling

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `call:start` | Client → Server | `{ conversationId, type: "audio" \| "video" }` | Start a call. Server creates call record, broadcasts to conv. |
| `call:offer` | Client → Client | `{ callId, targetUserId, offer }` | WebRTC offer (relayed via server). |
| `call:answer` | Client → Client | `{ callId, targetUserId, answer }` | WebRTC answer. |
| `call:ice` | Client → Client | `{ targetUserId, candidate }` | ICE candidate. |
| `call:end` | Both | `{ callId, targetUserIds? }` | End call. |
