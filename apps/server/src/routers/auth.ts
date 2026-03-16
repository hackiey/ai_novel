import { z } from "zod";
import { ObjectId } from "mongodb";
import { registerSchema, loginSchema } from "@ai-novel/types";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";
import { TRPCError } from "@trpc/server";

function serializeUser(doc: any) {
  if (!doc) return null;
  const { _id, passwordHash, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const authRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.collection("users").findOne({ email: input.email });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      }

      // First user becomes admin
      const userCount = await ctx.db.collection("users").countDocuments();
      const role = userCount === 0 ? "admin" : "user";

      const now = new Date();
      const passwordHash = await hashPassword(input.password);
      const doc = {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role,
        createdAt: now,
        updatedAt: now,
      };

      const result = await ctx.db.collection("users").insertOne(doc);
      const userId = result.insertedId.toHexString();

      const token = signToken({ userId, email: input.email, role: role as "admin" | "user" });
      return { token, user: serializeUser({ _id: result.insertedId, ...doc }) };
    }),

  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.collection("users").findOne({ email: input.email });
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      const valid = await verifyPassword(input.password, user.passwordHash as string);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      const token = signToken({
        userId: user._id.toHexString(),
        email: user.email as string,
        role: user.role as "admin" | "user",
      });
      return { token, user: serializeUser(user) };
    }),

  me: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.collection("users").findOne({ _id: new ObjectId(ctx.user.userId) });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      let permissionGroup = null;
      if (user.permissionGroupId) {
        permissionGroup = await ctx.db.collection("permission_groups").findOne({
          _id: new ObjectId(user.permissionGroupId as string),
        });
        if (permissionGroup) {
          const { _id: pgId, ...pgRest } = permissionGroup;
          permissionGroup = { _id: pgId.toHexString(), ...pgRest };
        }
      }

      return { ...serializeUser(user), permissionGroup };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      displayName: z.string().min(1).max(100).optional(),
      password: z.string().min(6).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = { updatedAt: new Date() };
      if (input.displayName !== undefined) updateFields.displayName = input.displayName;
      if (input.password !== undefined) updateFields.passwordHash = await hashPassword(input.password);

      const result = await ctx.db.collection("users").findOneAndUpdate(
        { _id: new ObjectId(ctx.user.userId) },
        { $set: updateFields },
        { returnDocument: "after" },
      );
      return serializeUser(result);
    }),
});
