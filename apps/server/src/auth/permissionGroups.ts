import { ObjectId, type Db } from "mongodb";

export const DEFAULT_PERMISSION_GROUP_NAME = "Default";

export async function ensureDefaultPermissionGroup(db: Db) {
  await db.collection("permission_groups").updateOne(
    { name: DEFAULT_PERMISSION_GROUP_NAME },
    {
      $setOnInsert: {
        name: DEFAULT_PERMISSION_GROUP_NAME,
        allowedModels: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );

  return db.collection("permission_groups").findOne({ name: DEFAULT_PERMISSION_GROUP_NAME });
}

export async function getPermissionGroupById(db: Db, permissionGroupId: unknown) {
  const normalizedId = normalizeObjectId(permissionGroupId);
  if (!normalizedId) return null;

  return db.collection("permission_groups").findOne({ _id: new ObjectId(normalizedId) });
}

export async function getUserAllowedModels(db: Db, userId: string, availableModels: string[]) {
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user?.permissionGroupId) {
    return [];
  }

  const group = await getPermissionGroupById(db, user.permissionGroupId);
  if (!group || !Array.isArray(group.allowedModels) || group.allowedModels.length === 0) {
    return [];
  }

  const allowedModels = new Set(
    group.allowedModels.filter((model): model is string => typeof model === "string" && model.length > 0),
  );

  return availableModels.filter((model) => allowedModels.has(model));
}

export function isDefaultPermissionGroup(group: { name?: unknown } | Record<string, unknown> | null | undefined) {
  return group?.name === DEFAULT_PERMISSION_GROUP_NAME;
}

function normalizeObjectId(value: unknown) {
  if (value instanceof ObjectId) {
    return value.toHexString();
  }
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return value;
  }
  return null;
}
