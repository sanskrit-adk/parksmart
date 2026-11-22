/**
 * Demand-based price guidance for owners (traditional, explainable rule over
 * the ML forecast): scale the current price with predicted occupancy so busy
 * hours earn more and quiet hours fill up. Bounded to −25%…+35%.
 */
export function demandPrice(basePrice: number, occupancyRate: number) {
  const factor = Math.min(1.35, Math.max(0.75, 0.75 + (occupancyRate - 0.2) * 0.85));
  return Math.max(0, Math.round(basePrice * factor * 4) / 4);
}
