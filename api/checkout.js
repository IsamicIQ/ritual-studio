/* Card payments (Stripe Checkout). Filled in once the Stripe integration is connected. */
import { handle, HttpError } from "./_lib/http.js";

export const POST = handle(async () => {
  throw new HttpError(503, "Card payments aren't switched on yet.");
});
