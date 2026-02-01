import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/db";
import { users, authCredentials } from "../db/schema";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { AppError } from "../middlewares/errorHandler";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      throw new AppError("Email, password and name are required", 400);
    }

    const existing = await db.query.authCredentials.findFirst({
      where: eq(authCredentials.email, email.toLowerCase()),
    });
    if (existing) throw new AppError("Email already registered", 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(users)
      .values({ name: name.trim() })
      .returning();

    if (!user) throw new AppError("Failed to create user", 500);

    await db.insert(authCredentials).values({
      userId: user.id,
      email: email.toLowerCase(),
      passwordHash,
    });

    const accessToken = signAccessToken(user.id);
    const tokenId = uuidv4();
    const refreshToken = signRefreshToken(user.id, tokenId);

    await db
      .update(authCredentials)
      .set({
        refreshToken,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .where(eq(authCredentials.userId, user.id));

    res.status(201).json({
      user: { id: user.id, name: user.name, avatar: user.avatar },
      accessToken,
      refreshToken,
      expiresIn: 900,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError("Email and password required", 400);

    const cred = await db.query.authCredentials.findFirst({
      where: eq(authCredentials.email, email.toLowerCase()),
    });

    if (!cred) throw new AppError("Invalid credentials", 401);

    const user = await db.query.users.findFirst({
      where: eq(users.id, cred.userId),
    });
    if (!user) throw new AppError("User not found", 404);

    const valid = await bcrypt.compare(password, cred.passwordHash);
    if (!valid) throw new AppError("Invalid credentials", 401);

    const accessToken = signAccessToken(user.id);
    const tokenId = uuidv4();
    const refreshToken = signRefreshToken(user.id, tokenId);

    await db
      .update(authCredentials)
      .set({
        refreshToken,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .where(eq(authCredentials.userId, user.id));

    res.json({
      user: { id: user.id, name: user.name, avatar: user.avatar },
      accessToken,
      refreshToken,
      expiresIn: 900,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError("Refresh token required", 400);

    const payload = verifyRefreshToken(refreshToken);
    const cred = await db.query.authCredentials.findFirst({
      where: eq(authCredentials.userId, payload.userId),
    });

    if (!cred || cred.refreshToken !== refreshToken) {
      throw new AppError("Invalid refresh token", 401);
    }
    if (
      cred.refreshTokenExpiresAt &&
      cred.refreshTokenExpiresAt < new Date()
    ) {
      throw new AppError("Refresh token expired", 401);
    }

    const tokenId = uuidv4();
    const newRefresh = signRefreshToken(payload.userId, tokenId);
    const accessToken = signAccessToken(payload.userId);

    await db
      .update(authCredentials)
      .set({
        refreshToken: newRefresh,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .where(eq(authCredentials.userId, payload.userId));

    res.json({
      accessToken,
      refreshToken: newRefresh,
      expiresIn: 900,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/me", authMiddleware, async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new AppError("User not found", 404);

    res.json({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      status: user.status,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
