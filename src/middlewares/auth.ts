import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessPayload } from "../lib/jwt";
import { AppError } from "./errorHandler";

export interface AuthRequest extends Request {
  user?: AccessPayload;
}

export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.cookies?.accessToken;

    if (!token) {
      throw new AppError("Unauthorized: No token provided", 401);
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof AppError) next(err);
    else next(new AppError("Invalid or expired token", 401));
  }
}
