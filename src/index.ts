import "dotenv/config";
import http from "http";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";

import { errorHandler } from "./middlewares/errorHandler";
import { apiLimiter, authLimiter } from "./middlewares/rateLimit";
import { setupSocket } from "./socket";

import authRoutes from "./routes/auth";
import conversationRoutes from "./routes/conversations";
import messageRoutes from "./routes/messages";
import callRoutes from "./routes/calls";
import blockRoutes from "./routes/block";
import pushRoutes from "./routes/push";
import uploadRoutes from "./routes/upload";
import userRoutes from "./routes/users";

const app = express();
app.set("trust proxy", 1);  // Trust first proxy (e.g. nginx)
const server = http.createServer(app);

const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/", (_req, res) => {
  res.json({ message: "Chat API running", version: "1.0" });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/conversations", apiLimiter, conversationRoutes);
app.use("/api/messages", apiLimiter, messageRoutes);
app.use("/api/calls", apiLimiter, callRoutes);
app.use("/api/block", apiLimiter, blockRoutes);
app.use("/api/push", apiLimiter, pushRoutes);
app.use("/api/upload", apiLimiter, uploadRoutes);
app.use("/api/users", apiLimiter, userRoutes);

app.use(errorHandler);

setupSocket(server);

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Socket.IO attached`);
});
