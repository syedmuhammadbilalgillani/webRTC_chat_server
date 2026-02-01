import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
    this.name = "AppError";
  }
}

export const errorHandler = (
  err: Error & { status?: number },
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
};
