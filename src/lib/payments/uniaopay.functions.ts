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
      throw new Error("UNIAOPAY_API_KEY is not configured");
    }

    const response = await fetch(`${UNIAOPAY_API_BASE}/pix/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`UniaoPay API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
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
