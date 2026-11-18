/* Staff sign-in: Clerk proves who the person is; the staff table decides what they may do.

   - The browser sends the Clerk session token as `Authorization: Bearer <token>`.
   - We verify it, look up the Clerk user's verified email addresses, and match one to an
     active row in `staff`.
   - Anyone listed in the OWNER_EMAILS environment variable (comma separated) becomes an
     owner the first time they sign in, so the studio can never be locked out. */
import { createClerkClient, verifyToken } from "@clerk/backend";
import { db, newId } from "./db.js";
import { HttpError } from "./http.js";

export const ROLES = ["owner", "manager", "instructor"];
const RANK = { instructor: 1, manager: 2, owner: 3 };

let _clerk = null;
const clerk = () => (_clerk ||= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }));

const emailCache = new Map(); // userId -> { emails, at }

async function verifiedEmails(userId) {
  const hit = emailCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.emails;
  const user = await clerk().users.getUser(userId);
  const emails = (user.emailAddresses || [])
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const out = { emails, name };
  emailCache.set(userId, { emails: out, at: Date.now() });
  return out;
}

const owners = () => String(process.env.OWNER_EMAILS || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function requireStaff(request, minRole = "instructor") {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Please sign in.");

  let payload;
  try {
    const r = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    payload = r && "data" in r ? r.data : r;
    if (r && r.errors) payload = null;
  } catch { payload = null; }
  if (!payload || !payload.sub) throw new HttpError(401, "Your sign-in has expired. Please sign in again.");

  const { emails, name } = await verifiedEmails(payload.sub);
  const sql = db();
  let rows = emails.length
    ? await sql`select * from staff where lower(email) = any(${emails}) order by active desc limit 1`
    : [];
  let staff = rows[0];

  const ownerEmail = emails.find((e) => owners().includes(e));
  if (ownerEmail && (!staff || staff.role !== "owner" || !staff.active)) {
    rows = await sql`
      insert into staff (id, name, email, role, active)
      values (${newId()}, ${name || ownerEmail.split("@")[0]}, ${ownerEmail}, 'owner', true)
      on conflict (email) do update set role = 'owner', active = true
      returning *`;
    staff = rows[0];
  }

  if (!staff || !staff.active) {
    throw new HttpError(403, `${emails[0] || "This account"} isn't on the studio's staff list. Ask the studio owner to add you.`);
  }
  if (RANK[staff.role] < RANK[minRole]) throw new HttpError(403, "Your role can't do that. Ask a manager or the owner.");
  if (!staff.clerk_user_id || (name && !staff.name)) {
    await sql`update staff set clerk_user_id = ${payload.sub}, name = coalesce(nullif(name, ''), ${name}) where id = ${staff.id}`;
  }
  return staff;
}

export const can = (staff, role) => RANK[staff.role] >= RANK[role];
