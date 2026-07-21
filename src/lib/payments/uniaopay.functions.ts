import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UNIAOPAY_API_BASE = "https://uniao7pay.shop/api/v1/uniaopay";

export const createPixCharge = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        amount: z.number(),
        description: z.string(),
        external_id: z.string(),
        webhook_url: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.UNIAOPAY_API_KEY;
    if (!apiKey) {
      throw new Error("UNIAOPAY_API_KEY não está configurada no servidor");
    }

    // Tenta múltiplos formatos de autenticação aceitos pelo gateway
    const attempts: Record<string, string>[] = [
      { "Content-Type": "application/json", "x-api-key": apiKey },
      { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      { "Content-Type": "application/json", "api-key": apiKey },
    ];

    let lastStatus = 0;
    let lastBody = "";

    for (const headers of attempts) {
      const response = await fetch(`${UNIAOPAY_API_BASE}/pix/create`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });

      const text = await response.text();
      lastStatus = response.status;
      lastBody = text;

      if (response.ok) {
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`Resposta inválida do UniaoPay: ${text.slice(0, 200)}`);
        }
      }

      if (response.status !== 401 && response.status !== 403) {
        break;
      }
    }

    console.error("[UniaoPay] Falha ao criar cobrança PIX", {
      status: lastStatus,
      body: lastBody.slice(0, 500),
    });
    throw new Error(
      `UniaoPay ${lastStatus}: ${lastBody.slice(0, 200) || "sem resposta"}`
    );
  });

export const getPixStatus = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ transaction_id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.UNIAOPAY_API_KEY;
    if (!apiKey) {
      throw new Error("UNIAOPAY_API_KEY is not configured");
    }

    const response = await fetch(`${UNIAOPAY_API_BASE}/pix/${data.transaction_id}`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`UniaoPay API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  });
