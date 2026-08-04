/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { redactSecretLeaks } from "@y/security";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class UnifiedLogger {
  constructor(private context: string) {}

  public log(level: LogLevel, message: string, meta: Record<string, any> = {}): void {
    const timestamp = new Date().toISOString();
    
    // Always clean potential credentials from log payloads prior to disk/stdout output
    const cleanMessage = redactSecretLeaks(message);
    const cleanMeta = JSON.parse(redactSecretLeaks(JSON.stringify(meta)));

    const logPayload = {
      timestamp,
      level: level.toUpperCase(),
      context: this.context,
      message: cleanMessage,
      ...cleanMeta,
    };

    const formattedLog = `[${timestamp}] [Y-OS:${level.toUpperCase()}] [${this.context}] ${cleanMessage} ${
      Object.keys(cleanMeta).length > 0 ? JSON.stringify(cleanMeta) : ""
    }`;

    switch (level) {
      case "debug":
        if (process.env.NODE_ENV !== "production") {
          console.debug(formattedLog);
        }
        break;
      case "info":
        console.info(formattedLog);
        break;
      case "warn":
        console.warn(formattedLog);
        break;
      case "error":
        console.error(formattedLog);
        break;
    }
  }

  public debug(message: string, meta?: Record<string, any>) { this.log("debug", message, meta); }
  public info(message: string, meta?: Record<string, any>) { this.log("info", message, meta); }
  public warn(message: string, meta?: Record<string, any>) { this.log("warn", message, meta); }
  public error(message: string, meta?: Record<string, any>) { this.log("error", message, meta); }
}

export const sysLogger = new UnifiedLogger("SYSTEM");
