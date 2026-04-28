import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { t, type Locale } from "./i18n.js";

interface SummaryItem {
  name: string;
  importance: "core" | "major" | "minor";
  summary: string;
}

interface SummaryConfig {
  fullSummaryMaxItems: number;
}

/**
 * Build a structured world summary text from characters and world settings.
 * Groups both by importance.
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

  const groupByImportance = (items: SummaryItem[]) => {
    const groups: Record<string, SummaryItem[]> = { core: [], major: [], minor: [] };
    for (const it of items) {
      const imp = it.importance || "minor";
      groups[imp].push(it);
    }
    return groups;
  };

  if (characters.length > 0) {
    const charGroups = groupByImportance(characters);
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

  if (worldSettings.length > 0) {
    const settingGroups = groupByImportance(worldSettings);
    lines.push("");
    lines.push(texts.worldSettingsHeading);
    for (const imp of ["core", "major", "minor"] as const) {
      const group = settingGroups[imp];
      if (group.length === 0) continue;
      const label = texts.importanceLabel[imp] || imp;
      lines.push(`**${label}${locale === "zh" ? "设定" : " Settings"}：**`);
      for (const ws of group) {
        const summary = compress && imp === "minor"
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
 *
 * Cache stores world-level entries only (characters/settings with projectId
 * unset/null). When a project context is provided, additionally fetch that
 * project's entries (uncached, small dataset) and merge before formatting so
 * the summary reflects current scope: world-level + current project, never
 * sibling projects.
 */
export async function getOrRefreshWorldSummary(
  db: Db,
  worldId: string,
  locale: Locale = "zh",
  projectId?: string,
): Promise<string> {
  const worlds = db.collection("worlds");
  const world = await worlds.findOne({ _id: new ObjectId(worldId) });

  if (!world) return "";

  const config: SummaryConfig = {
    fullSummaryMaxItems: (world.summaryConfig as any)?.fullSummaryMaxItems ?? 500,
  };

  let worldChars: SummaryItem[];
  let worldSettings: SummaryItem[];

  if (!world.summaryStale && world.summaryCharacters && world.summarySettings) {
    worldChars = world.summaryCharacters as SummaryItem[];
    worldSettings = world.summarySettings as SummaryItem[];
  } else {
    const wid = new ObjectId(worldId);
    const worldIdMatch = { $in: [worldId, wid] };
    const [chars, settings] = await Promise.all([
      db.collection("characters")
        // World-level only: projectId null OR missing.
        .find({ worldId: worldIdMatch, projectId: null })
        .project({ name: 1, importance: 1, summary: 1 })
        .sort({ name: 1 })
        .toArray(),
      db.collection("world_settings")
        .find({ worldId: worldIdMatch, projectId: null })
        .project({ title: 1, importance: 1, summary: 1 })
        .sort({ title: 1 })
        .toArray(),
    ]);

    worldChars = chars.map((c) => ({
      name: c.name as string,
      importance: (c.importance as "core" | "major" | "minor") || "minor",
      summary: (c.summary as string) || "",
    }));
    worldSettings = settings.map((ws) => ({
      name: ws.title as string,
      importance: (ws.importance as "core" | "major" | "minor") || "minor",
      summary: (ws.summary as string) || "",
    }));

    await worlds.updateOne(
      { _id: new ObjectId(worldId) },
      { $set: { summaryCharacters: worldChars, summarySettings: worldSettings, summaryStale: false } }
    );
  }

  // No project context: just return world-level summary.
  if (!projectId) {
    return buildWorldSummary(worldChars, worldSettings, config, locale);
  }

  // Fetch project-level overlay (uncached). Small dataset per project.
  const wid = new ObjectId(worldId);
  const pid = new ObjectId(projectId);
  const [projChars, projSettings] = await Promise.all([
    db.collection("characters")
      .find({ worldId: { $in: [worldId, wid] }, projectId: { $in: [projectId, pid] } })
      .project({ name: 1, importance: 1, summary: 1 })
      .sort({ name: 1 })
      .toArray(),
    db.collection("world_settings")
      .find({ worldId: { $in: [worldId, wid] }, projectId: { $in: [projectId, pid] } })
      .project({ title: 1, importance: 1, summary: 1 })
      .sort({ title: 1 })
      .toArray(),
  ]);

  const projCharItems: SummaryItem[] = projChars.map((c) => ({
    name: c.name as string,
    importance: (c.importance as "core" | "major" | "minor") || "minor",
    summary: (c.summary as string) || "",
  }));
  const projSettingItems: SummaryItem[] = projSettings.map((ws) => ({
    name: ws.title as string,
    importance: (ws.importance as "core" | "major" | "minor") || "minor",
    summary: (ws.summary as string) || "",
  }));

  return buildWorldSummary(
    [...worldChars, ...projCharItems],
    [...worldSettings, ...projSettingItems],
    config,
    locale,
  );
}
