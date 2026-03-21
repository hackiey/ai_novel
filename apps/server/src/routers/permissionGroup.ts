import { z } from "zod";
import { ObjectId } from "mongodb";
import { createPermissionGroupSchema, updatePermissionGroupSchema, objectIdSchema } from "@ai-novel/types";
import { router, adminProcedure } from "../trpc.js";
import { TRPCError } from "@trpc/server";
import { isDefaultPermissionGroup } from "../auth/permissionGroups.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const permissionGroupRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const docs = await ctx.db
      .collection("permission_groups")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(serializeDoc);
  }),

  getById: adminProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("permission_groups")
        .findOne({ _id: new ObjectId(input.id) });
      return serializeDoc(doc);
    }),

  create: adminProcedure
    .input(createPermissionGroupSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const doc = {
        name: input.name,
        allowedModels: input.allowedModels ?? [],
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("permission_groups").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: adminProcedure
    .input(z.object({ id: objectIdSchema, data: updatePermissionGroupSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.collection("permission_groups").findOne({ _id: new ObjectId(input.id) });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Permission group not found" });
      }
      if (isDefaultPermissionGroup(existing)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Default permission group cannot be modified" });
      }

      const updateFields: Record<string, any> = { updatedAt: new Date() };
      if (input.data.name !== undefined) updateFields.name = input.data.name;
      if (input.data.allowedModels !== undefined) updateFields.allowedModels = input.data.allowedModels;

      const result = await ctx.db
        .collection("permission_groups")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id) },
          { $set: updateFields },
          { returnDocument: "after" },
        );
      return serializeDoc(result);
    }),

  delete: adminProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.collection("permission_groups").findOne({ _id: new ObjectId(input.id) });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Permission group not found" });
      }
      if (isDefaultPermissionGroup(existing)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Default permission group cannot be deleted" });
      }

      // Remove permissionGroupId from users who have this group
      await ctx.db.collection("users").updateMany(
        { permissionGroupId: input.id },
        { $unset: { permissionGroupId: "" } },
      );
      await ctx.db
        .collection("permission_groups")
        .deleteOne({ _id: new ObjectId(input.id) });
      return { success: true };
    }),

  // User management
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const docs = await ctx.db
      .collection("users")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map((doc) => {
      const { _id, passwordHash, ...rest } = doc;
      return { _id: _id.toHexString(), ...rest };
    });
  }),

  assignUser: adminProcedure
    .input(z.object({
      userId: objectIdSchema,
      permissionGroupId: objectIdSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const update = input.permissionGroupId
        ? { $set: { permissionGroupId: input.permissionGroupId, updatedAt: new Date() } }
        : { $unset: { permissionGroupId: "" }, $set: { updatedAt: new Date() } };

      await ctx.db.collection("users").updateOne(
        { _id: new ObjectId(input.userId) },
        update,
      );
      return { success: true };
    }),

  setUserRole: adminProcedure
    .input(z.object({
      userId: objectIdSchema,
      role: z.enum(["admin", "user"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
      }
      await ctx.db.collection("users").updateOne(
        { _id: new ObjectId(input.userId) },
        { $set: { role: input.role, updatedAt: new Date() } },
      );
      return { success: true };
    }),
});
