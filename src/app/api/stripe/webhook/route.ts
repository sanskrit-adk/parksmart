import type Stripe from "stripe";
import { applyCheckoutSession } from "@/lib/bookings";
import { serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

/** Stripe → ParkSmart. Configure the endpoint for checkout.session.* events. */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = serverEnv().stripeWebhookSecret;
  if (!stripe || !secret) return new Response("Stripe webhook not configured", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await applyCheckoutSession(event.data.object);
        break;
      case "checkout.session.expired": {
        const s = event.data.object;
        if (s.metadata?.kind === "booking" && s.metadata.booking_id) {
          await createAdminClient()
            .from("bookings")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", s.metadata.booking_id)
            .eq("status", "pending_payment");
        } else if (s.metadata?.kind === "extension" && s.metadata.extension_id) {
          await createAdminClient().from("booking_extensions").update({ status: "failed" }).eq("id", s.metadata.extension_id).eq("status", "pending");
        }
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handling failed", err);
    return new Response("Handler error", { status: 500 });
  }
  return Response.json({ received: true });
}
