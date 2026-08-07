import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const checkOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { verifyAndSettleOrder } = await import("@/lib/payments/verify.server");
    const res = await verifyAndSettleOrder(data.orderId);
    return { status: res.status, paid: res.paid, remote: res.remote ?? null };
  });
