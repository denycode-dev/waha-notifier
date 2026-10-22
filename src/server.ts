import http from "node:http";
import { URL } from "node:url";
import { timingSafeEqual } from "node:crypto";

export interface AppConfig {
  port: number;
  webhookSecret: string;
  wahaUrl: string;
  wahaApiKey: string;
  wahaSession: string;
  wahaChatId: string;
  allowSelfSignedCerts: boolean;
}

export interface CoolifyWebhookPayload {
  event?: string;
  message?: string;
  application_name?: string;
  container_name?: string;
  server_name?: string;
  status?: string;
  cpu?: string | number;
  ram?: string | number;
  disk?: string | number;
  url?: string;
  [key: string]: unknown;
}

interface HttpError extends Error {
  statusCode: number;
}

function createHttpError(message: string, statusCode: number): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

const REQUIRED_ENV_VARS = [
  "WEBHOOK_SECRET",
  "WAHA_URL",
  "WAHA_API_KEY",
  "WAHA_SESSION",
  "WAHA_CHAT_ID",
] as const;

export function loadConfig(): AppConfig {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  const portRaw = process.env["PORT"] ?? "3000";
  const port = Number.parseInt(portRaw, 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT environment variable: "${portRaw}". Must be between 1 and 65535.`);
  }

  const allowSelfSignedCerts =
    process.env["ALLOW_SELF_SIGNED_CERTS"] === "true" ||
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] === "0";

  if (allowSelfSignedCerts) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
  }

  return {
    port,
    webhookSecret: process.env["WEBHOOK_SECRET"]!,
    wahaUrl: process.env["WAHA_URL"]!.replace(/\/+$/, ""),
    wahaApiKey: process.env["WAHA_API_KEY"]!,
    wahaSession: process.env["WAHA_SESSION"]!,
    wahaChatId: process.env["WAHA_CHAT_ID"]!,
    allowSelfSignedCerts,
  };
}

const MAX_BODY_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const SEND_TIMEOUT_MS = 10000;

export const EVENT_LABELS: Readonly<Record<string, string>> = {
  test: "TEST WEBHOOK",
  deployment_success: "DEPLOYMENT BERHASIL",
  deployment_failed: "DEPLOYMENT GAGAL",
  status_changed: "STATUS RESOURCE BERUBAH",
  restart_limit_reached: "BATAS RESTART TERCAPAI",
  container_stopped: "CONTAINER BERHENTI",
  container_restarted: "CONTAINER RESTART",
  server_reachable: "SERVER ONLINE KEMBALI",
  server_unreachable: "SERVER TIDAK TERJANGKAU",
  high_disk_usage: "DISK HAMPIR PENUH",
  server_patch_check: "SERVER PATCH CHECK",
  server_patch_check_error: "SERVER PATCH CHECK GAGAL",
  traefik_version_outdated: "TRAEFIK PERLU DIPERBARUI",
  docker_cleanup_success: "DOCKER CLEANUP BERHASIL",
  docker_cleanup_failed: "DOCKER CLEANUP GAGAL",
  backup_success: "BACKUP BERHASIL",
  backup_failed: "BACKUP GAGAL",
  scheduled_task_success: "SCHEDULED TASK BERHASIL",
  scheduled_task_failed: "SCHEDULED TASK GAGAL",
  host_resource_alert: "ALERT RESOURCE SERVER",
};

export function safeText(value: unknown, max = 1500): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .slice(0, max);
}

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function formatMessage(data: CoolifyWebhookPayload): string {
  const event = safeText(data.event, 100);
  const label = (event && EVENT_LABELS[event]) || "NOTIFIKASI COOLIFY";

  const lines: string[] = [
    `🔔 ${label}`,
    "",
    safeText(data.message, 2000) || "Event diterima.",
  ];

  const fields: ReadonlyArray<[string, unknown]> = [
    ["Aplikasi", data.application_name],
    ["Container", data.container_name],
    ["Server", data.server_name],
    ["Status", data.status],
    ["CPU", data.cpu],
    ["RAM", data.ram],
    ["Disk", data.disk],
  ];

  for (const [fieldLabel, value] of fields) {
    if (value !== undefined && value !== null && value !== "") {
      lines.push(`${fieldLabel}: ${safeText(String(value), 200)}`);
    }
  }

  if (typeof data.url === "string" && /^https:\/\//i.test(data.url)) {
    lines.push(`Dashboard: ${safeText(data.url, 500)}`);
  }

  lines.push("", `Event: ${event || "unknown"}`);
  return lines.join("\n");
}

function readJson(req: http.IncomingMessage): Promise<CoolifyWebhookPayload> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;

    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;

      if (bytes > MAX_BODY_BYTES) {
        reject(createHttpError("Payload too large", 413));
        req.destroy();
        return;
      }

      body += chunk.toString("utf8");
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}") as CoolifyWebhookPayload);
      } catch {
        reject(createHttpError("Invalid JSON", 400));
      }
    });

    req.on("error", (err) => reject(err));
  });
}

async function sendToWaha(config: AppConfig, text: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.wahaUrl}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": config.wahaApiKey,
      },
      body: JSON.stringify({
        session: config.wahaSession,
        chatId: config.wahaChatId,
        text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const detail = errorText ? `: ${errorText.slice(0, 200)}` : "";
      throw new Error(`WAHA returned HTTP ${response.status}${detail}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export function createServer(config: AppConfig): http.Server {
  const expectedPath = `/hook/${config.webhookSecret}`;

  return http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method !== "POST" || !safeCompare(pathname, expectedPath)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    try {
      const data = await Promise.race([
        readJson(req),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            reject(createHttpError("Request timeout", 408));
          }, REQUEST_TIMEOUT_MS),
        ),
      ]);

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid payload" }));
        return;
      }

      if (typeof data.event !== "string") {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Missing event" }));
        return;
      }

      const text = formatMessage(data);
      await sendToWaha(config, text);

      res.writeHead(200);
      res.end(
        JSON.stringify({
          accepted: true,
          event: data.event,
        }),
      );
    } catch (err: unknown) {
      const error = err as Partial<HttpError> & { cause?: unknown };
      const status = error.statusCode || 502;
      const message = error.message || "Unknown error";
      const causeStr =
        error.cause instanceof Error
          ? `: ${error.cause.message}`
          : error.cause
            ? `: ${String(error.cause)}`
            : "";

      // Do not log secrets, full payloads, or WAHA response bodies
      console.error(`Notification failed: ${message}${causeStr}`);

      if (!res.headersSent && !res.destroyed) {
        res.writeHead(status);
        res.end(
          JSON.stringify({
            error:
              status === 502
                ? `Notification delivery failed (${message}${causeStr})`
                : message,
          }),
        );
      }
    }
  });
}

function start(): void {
  const config = loadConfig();
  const server = createServer(config);

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`Notification bridge listening on port ${config.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close((err) => {
      if (err) {
        console.error("Error during server close:", err);
        process.exit(1);
      }
      console.log("Server stopped successfully.");
      process.exit(0);
    });

    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    process.exit(1);
  });
}

// Start if executed directly
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  start();
}
