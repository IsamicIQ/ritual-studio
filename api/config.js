/* Public settings the browser needs (the Clerk publishable key is meant to be public). */
import { handle, json } from "./_lib/http.js";

export const GET = handle(async () =>
  json({ clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || null }));
