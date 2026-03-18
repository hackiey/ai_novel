import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

interface SummaryItem {
  name: string;
  role?: string;
  category?: string;
  importance: "core" | "major" | "minor";
  summary: string;
}

interface SummaryConfig {
  fullSummaryMaxItems: number;
}

/**
 * Build a structured world summary text from characters and world settings.
 * Groups characters by importance, world settings by category.
 */
export function buildWorldSummary(
  characters: SummaryItem[],
  worldSettings: SummaryItem[],
  config: SummaryConfig = { fullSummaryMaxItems: 500 }
): string {
  const totalItems = characters.length + worldSettings.length;
  if (totalItems === 0) return "";

  const compress = totalItems > config.fullSummaryMaxItems;
  const lines: string[] = [];

  // Characters grouped by importance
  const charGroups: Record<string, SummaryItem[]> = { core: [], major: [], minor: [] };
  for (const c of characters) {
    const imp = c.importance || "minor";
    charGroups[imp].push(c);
  }

  const hasChars = characters.length > 0;
  if (hasChars) {
    lines.push("### 角色");
    for (const imp of ["core", "major", "minor"] as const) {
      const group = charGroups[imp];
      if (group.length === 0) continue;
      const label = imp === "core" ? "核心" : imp === "major" ? "重要" : "次要";
      lines.push(`**${label}角色：**`);
      for (const c of group) {
        const roleTag = c.role ? `[${c.role}]` : "";
        const summary = compress && imp === "minor"
          ? (c.summary || "").slice(0, 30)
          : (c.summary || "").slice(0, 50);
        lines.push(`- ${roleTag} ${c.name}${summary ? ": " + summary : ""}`);
      }
    }
  }

  // World settings grouped by category
  const settingsByCategory: Record<string, SummaryItem[]> = {};
  for (const ws of worldSettings) {
    const cat = ws.category || "其他";
    if (!settingsByCategory[cat]) settingsByCategory[cat] = [];
    settingsByCategory[cat].push(ws);
  }

  const hasSettings = worldSettings.length > 0;
  if (hasSettings) {
    lines.push("");
    lines.push("### 世界设定");
    for (const [cat, items] of Object.entries(settingsByCategory)) {
      lines.push(`**${cat}：**`);
      for (const ws of items) {
        const summary = compress && ws.importance === "minor"
          ? (ws.summary || "").slice(0, 30)
          : (ws.summary || "").slice(0, 50);
        lines.push(`- ${ws.name}${summary ? ": " + summary : ""}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Get or refresh the world summary. If summaryStale, rebuild from DB and cache.
 */
export async function getOrRefreshWorldSummary(
  db: Db,
  worldId: string
): Promise<string> {
  const worlds = db.collection("worlds");
  const world = await worlds.findOne({ _id: new ObjectId(worldId) });

  if (!world) return "";

  // If not stale, return cached summary
  if (!world.summaryStale && world.summary) {
    return world.summary as string;
  }

  const config: SummaryConfig = {
    fullSummaryMaxItems: (world.summaryConfig as any)?.fullSummaryMaxItems ?? 500,
  };

  // Fetch characters and world settings
  const wid = new ObjectId(worldId);
  const [characters, settings] = await Promise.all([
    db.collection("characters")
      .find({ worldId: wid })
      .project({ name: 1, role: 1, importance: 1, summary: 1 })
      .sort({ name: 1 })
      .toArray(),
    db.collection("world_settings")
      .find({ worldId: wid })
      .project({ title: 1, category: 1, importance: 1, summary: 1 })
      .sort({ category: 1, title: 1 })
      .toArray(),
  ]);

  const charItems: SummaryItem[] = characters.map((c) => ({
    name: c.name as string,
    role: c.role as string | undefined,
    importance: (c.importance as "core" | "major" | "minor") || "minor",
    summary: (c.summary as string) || "",
  }));

  const settingItems: SummaryItem[] = settings.map((ws) => ({
    name: ws.title as string,
    category: ws.category as string | undefined,
    importance: (ws.importance as "core" | "major" | "minor") || "minor",
    summary: (ws.summary as string) || "",
  }));

  const summaryText = buildWorldSummary(charItems, settingItems, config);

  // Cache it
  await worlds.updateOne(
    { _id: new ObjectId(worldId) },
    { $set: { summary: summaryText, summaryStale: false } }
  );

  return summaryText;
}
