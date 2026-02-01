import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { AppError } from "../middlewares/errorHandler";
import config from "../config/config";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".bin";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxFileSize },
});

const router = Router();
router.use(authMiddleware);

router.post("/", upload.single("file"), (req: AuthRequest, res, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400);
    const url = `${config.uploads.baseUrl}/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  } catch (e) {
    next(e);
  }
});

export default router;
