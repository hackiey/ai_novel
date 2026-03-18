import { initTRPC, TRPCError } from "@trpc/server";
import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { Db, ObjectId } from "mongodb";
import { getDb } from "./db.js";
import { verifyToken, type JwtPayload } from "./auth/jwt.js";

/** Build a MongoDB filter that matches userId stored as either string or ObjectId */
export function userIdFilter(userId: string) {
  return { $in: [userId, new ObjectId(userId)] };
}

export interface Context {
  db: Db;
  user: JwtPayload | null;
}

export function createContext(opts: CreateFastifyContextOptions): Context {
  const db = getDb();
  let user: JwtPayload | null = null;

  const auth = opts.req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      user = verifyToken(auth.slice(7));
    } catch {
      // invalid token — user stays null
    }
  }

  return { db, user };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login required" });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
