import type { Config } from "drizzle-kit";
import dotenv from "dotenv";
dotenv.config();

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // host: DB_URL.hostname,
    // user: DB_URL.username,
    // password: DB_URL.password,
    // database: DB_URL.pathname.slice(1), // Remove leading '/'
    // ssl: {
    //   rejectUnauthorized: false // This will allow self-signed certificates
    // },
    host: process.env.DB_HOST || "",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "",
    ssl: {
      rejectUnauthorized: false, // ADD THIS
    },
  },
  verbose: true,
  strict: true,
} satisfies Config;