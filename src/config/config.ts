import dotenv from "dotenv";

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  db: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  redis: {
    url: string;
    typingTtlSeconds: number;
    presenceTtlSeconds: number;
  };
  uploads: {
    maxFileSize: number;
    baseUrl: string;
  };
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  db: {
    url: process.env.DATABASE_URL || "",
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "change-me-in-production",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "change-me-in-production",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || "7d",
  },
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    typingTtlSeconds: Number(process.env.REDIS_TYPING_TTL) || 5,
    presenceTtlSeconds: Number(process.env.REDIS_PRESENCE_TTL) || 60,
  },
  uploads: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    baseUrl: process.env.UPLOAD_BASE_URL || "http://localhost:3000/uploads",
  },
};

export default config;
