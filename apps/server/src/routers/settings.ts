import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc.js";

const SETTINGS_KEY = "global";

export const settingsRouter = router({
  get: publicProcedure.query(async ({ ctx }) => {
    const doc = await ctx.db.collection("system_settings").findOne({ key: SETTINGS_KEY });
    return {
      registrationEnabled: doc?.registrationEnabled !== false,
    };
  }),

  update: adminProcedure
    .input(z.object({
      registrationEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      if (input.registrationEnabled !== undefined) {
        updateFields.registrationEnabled = input.registrationEnabled;
      }
      await ctx.db.collection("system_settings").updateOne(
        { key: SETTINGS_KEY },
        { $set: updateFields, $setOnInsert: { key: SETTINGS_KEY, createdAt: new Date() } },
        { upsert: true },
      );
      return { success: true };
    }),
});
