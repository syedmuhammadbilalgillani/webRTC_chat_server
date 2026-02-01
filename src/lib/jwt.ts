import jwt from "jsonwebtoken";
import config from "../config/config";

export interface AccessPayload {
  userId: string;
  type: "access";
}

export interface RefreshPayload {
  userId: string;
  tokenId: string;
  type: "refresh";
}

export function signAccessToken(userId: string): string {
  return jwt.sign(
    { userId, type: "access" } as AccessPayload,
    config.jwt.accessSecret,
    { expiresIn: 900 }
  );
}

export function signRefreshToken(userId: string, tokenId: string): string {
  return jwt.sign(
    { userId, tokenId, type: "refresh" } as RefreshPayload,
    config.jwt.refreshSecret,
    { expiresIn: "7d" }
  );
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, config.jwt.accessSecret) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as RefreshPayload;
}
