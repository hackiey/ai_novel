/**
 * 一次性迁移脚本：将角色旧字段 (profile.appearance/personality/background/goals/relationships, role)
 * 合并到 content 字段，然后删除旧字段。
 *
 * 用法: npx tsx apps/server/src/scripts/migrate-character-profile.ts
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db();
  const col = db.collection("characters");

  const cursor = col.find({
    $or: [
      { profile: { $exists: true } },
      { role: { $exists: true } },
    ],
  });

  let migrated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const profile = doc.profile as any;
    const role = doc.role as string | undefined;

    // Build content sections from old fields
    const sections: string[] = [];

    if (role) sections.push(`## 角色类型\n${role}`);
    if (profile?.appearance) sections.push(`## 外貌\n${profile.appearance}`);
    if (profile?.personality) sections.push(`## 性格\n${profile.personality}`);
    if (profile?.background) sections.push(`## 背景\n${profile.background}`);
    if (profile?.goals) sections.push(`## 目标\n${profile.goals}`);
    if (profile?.relationships?.length) {
      const rels = profile.relationships
        .map((r: any) => `- ${r.characterName}: ${r.relationship}`)
        .join("\n");
      sections.push(`## 关系\n${rels}`);
    }
    if (profile?.customFields && Object.keys(profile.customFields).length > 0) {
      for (const [key, value] of Object.entries(profile.customFields)) {
        if (value) sections.push(`## ${key}\n${value}`);
      }
    }

    if (sections.length === 0) {
      skipped++;
      // Still clean up empty old fields
      await col.updateOne(
        { _id: doc._id },
        { $unset: { profile: "", role: "" } },
      );
      continue;
    }

    const newContent = sections.join("\n\n");
    const existingContent = (doc.content as string) || "";
    const mergedContent = existingContent
      ? existingContent + "\n\n" + newContent
      : newContent;

    await col.updateOne(
      { _id: doc._id },
      {
        $set: { content: mergedContent, updatedAt: new Date() },
        $unset: { profile: "", role: "" },
      },
    );

    migrated++;
    console.log(`  Migrated: ${doc.name} (${doc._id})`);
  }

  // Also mark all world summaries as stale
  if (migrated > 0) {
    await db.collection("worlds").updateMany({}, { $set: { summaryStale: true } });
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped (no profile data): ${skipped}`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
