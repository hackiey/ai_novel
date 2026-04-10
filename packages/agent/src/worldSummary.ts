import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { t, type Locale } from "./i18n.js";

interface SummaryItem {
  name: string;
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
  config: SummaryConfig = { fullSummaryMaxItems: 500 },
  locale: Locale = "zh"
): string {
  const totalItems = characters.length + worldSettings.length;
  if (totalItems === 0) return "";

  const texts = t(locale);
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
    lines.push(texts.charactersHeading);
    for (const imp of ["core", "major", "minor"] as const) {
      const group = charGroups[imp];
      if (group.length === 0) continue;
      const label = texts.importanceLabel[imp] || imp;
      lines.push(`**${label}${locale === "zh" ? "角色" : " Characters"}：**`);
      for (const c of group) {
        const summary = compress && imp === "minor"
          ? (c.summary || "").slice(0, 30)
          : (c.summary || "").slice(0, 50);
        lines.push(`- ${c.name}${summary ? ": " + summary : ""}`);
      }
    }
  }

  // World settings grouped by category
  const settingsByCategory: Record<string, SummaryItem[]> = {};
  for (const ws of worldSettings) {
    const cat = ws.category || texts.uncategorized;
    if (!settingsByCategory[cat]) settingsByCategory[cat] = [];
    settingsByCategory[cat].push(ws);
  }

  const hasSettings = worldSettings.length > 0;
  if (hasSettings) {
    lines.push("");
    lines.push(texts.worldSettingsHeading);
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
 * Get or refresh the world summary.
 * summaryStale controls whether to re-query DB; formatting is always done per locale.
 */
export async function getOrRefreshWorldSummary(
  db: Db,
  worldId: string,
  locale: Locale = "zh"
): Promise<string> {
  const worlds = db.collection("worlds");
  const world = await worlds.findOne({ _id: new ObjectId(worldId) });

  if (!world) return "";

  const config: SummaryConfig = {
    fullSummaryMaxItems: (world.summaryConfig as any)?.fullSummaryMaxItems ?? 500,
  };

  // If not stale and we have cached raw data, rebuild formatted text from cache
  if (!world.summaryStale && world.summaryCharacters && world.summarySettings) {
    return buildWorldSummary(
      world.summaryCharacters as SummaryItem[],
      world.summarySettings as SummaryItem[],
      config,
      locale
    );
  }

  // Fetch characters and world settings
  const wid = new ObjectId(worldId);
  const worldIdFilter = { $in: [worldId, wid] };
  const [characters, settings] = await Promise.all([
    db.collection("characters")
      .find({ worldId: worldIdFilter })
      .project({ name: 1, importance: 1, summary: 1 })
      .sort({ name: 1 })
      .toArray(),
    db.collection("world_settings")
      .find({ worldId: worldIdFilter })
      .project({ title: 1, category: 1, importance: 1, summary: 1 })
      .sort({ category: 1, title: 1 })
      .toArray(),
  ]);

  const charItems: SummaryItem[] = characters.map((c) => ({
    name: c.name as string,
    importance: (c.importance as "core" | "major" | "minor") || "minor",
    summary: (c.summary as string) || "",
  }));

  const settingItems: SummaryItem[] = settings.map((ws) => ({
    name: ws.title as string,
    category: ws.category as string | undefined,
    importance: (ws.importance as "core" | "major" | "minor") || "minor",
    summary: (ws.summary as string) || "",
  }));

  // Cache raw data (not formatted text) so we can re-format per locale
  await worlds.updateOne(
    { _id: new ObjectId(worldId) },
    { $set: { summaryCharacters: charItems, summarySettings: settingItems, summaryStale: false } }
  );

  return buildWorldSummary(charItems, settingItems, config, locale);
}
