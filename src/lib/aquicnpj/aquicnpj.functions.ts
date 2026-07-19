import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const API_BASE = "https://api.aquicnpj.com";

export const getUsageStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const token = process.env.AQUICNPJ_ACCESS_TOKEN;
    if (!token) throw new Error("AQUICNPJ_ACCESS_TOKEN not configured");

    const start = Date.now();
    const response = await fetch(`${API_BASE}/subscription/usage-stats/`, {
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    const duration = Date.now() - start;

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  });
