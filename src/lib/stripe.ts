import "server-only";

import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

let stripe: Stripe | null = null;

export function getStripe() {
  const key = serverEnv().stripeSecretKey;
  if (!key) return null;
  stripe ??= new Stripe(key, { maxNetworkRetries: 2 });
  return stripe;
}

export const toCents = (dollars: number) => Math.round(dollars * 100);
