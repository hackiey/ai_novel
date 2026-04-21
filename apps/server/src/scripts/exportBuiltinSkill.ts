import "dotenv/config";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { connectDb, disconnectDb, getDb } from "../db.js";

const BUILTIN_DIR = resolve(import.meta.dirname, "../../builtin-skills");

function escapeYamlString(s: string): string {
  // Use double quotes; escape backslashes and double quotes
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatTags(tags: string[]): string {
  if (tags.length === 0) return "[]";
  return "[" + tags.map(escapeYamlString).join(", ") + "]";
}

function buildMarkdown(doc: {
  slug: string;
  name: string;
  description: string;
  tags?: string[];
  content?: string;
}): string {
  const tags = doc.tags ?? [];
  const frontmatter = [
    "---",
    `slug: ${doc.slug}`,
    `name: ${escapeYamlString(doc.name)}`,
    `description: ${escapeYamlString(doc.description)}`,
    `tags: ${formatTags(tags)}`,
    "---",
  ].join("\n");
  const body = (doc.content ?? "").trim();
  return `${frontmatter}\n\n${body}\n`;
}

function parseArgs(argv: string[]): { mode: "list" | "export"; all: boolean; slugs: string[] } {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.error(`Usage:
  pnpm --filter @ai-creator/server exec tsx src/scripts/exportBuiltinSkill.ts --list
  pnpm --filter @ai-creator/server exec tsx src/scripts/exportBuiltinSkill.ts --all
  pnpm --filter @ai-creator/server exec tsx src/scripts/exportBuiltinSkill.ts <slug> [<slug>...]`);
    process.exit(args.length === 0 ? 1 : 0);
  }
  if (args.includes("--list")) return { mode: "list", all: false, slugs: [] };
  if (args.includes("--all")) return { mode: "export", all: true, slugs: [] };
  return { mode: "export", all: false, slugs: args.filter((a) => !a.startsWith("--")) };
}

async function main() {
  const { mode, all, slugs } = parseArgs(process.argv);

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await connectDb(mongoUri);
  const db = getDb();

  try {
    if (mode === "list") {
      const drafts = await db
        .collection("skill_drafts")
        .find({})
        .project({ slug: 1, name: 1, description: 1, tags: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .toArray();

      if (drafts.length === 0) {
        console.log("(no drafts)");
        return;
      }

      console.log(`${drafts.length} draft(s):\n`);
      for (const d of drafts) {
        const tags = d.tags?.length ? ` [${d.tags.join(", ")}]` : "";
        console.log(`  ${d.slug}${tags}`);
        console.log(`    ${d.name}`);
        if (d.description) {
          const desc = d.description.length > 80 ? d.description.slice(0, 77) + "..." : d.description;
          console.log(`    ${desc}`);
        }
        console.log();
      }
      return;
    }

    // Export mode
    const filter = all ? {} : { slug: { $in: slugs } };
    const drafts = await db.collection("skill_drafts").find(filter).toArray();

    if (drafts.length === 0) {
      console.error(all ? "No drafts to export." : `No drafts found for slugs: ${slugs.join(", ")}`);
      process.exit(1);
    }

    if (!all) {
      const foundSlugs = new Set(drafts.map((d) => d.slug));
      const missing = slugs.filter((s) => !foundSlugs.has(s));
      if (missing.length > 0) {
        console.error(`Slugs not found in skill_drafts: ${missing.join(", ")}`);
      }
    }

    if (!existsSync(BUILTIN_DIR)) {
      await mkdir(BUILTIN_DIR, { recursive: true });
    }

    for (const d of drafts) {
      const md = buildMarkdown({
        slug: d.slug,
        name: d.name ?? d.slug,
        description: d.description ?? "",
        tags: d.tags ?? [],
        content: d.content ?? "",
      });
      const target = resolve(BUILTIN_DIR, `${d.slug}.md`);
      const exists = existsSync(target);
      await writeFile(target, md, "utf-8");
      console.log(`${exists ? "↻" : "+"} ${target}`);
    }

    console.log(`\nExported ${drafts.length} skill(s). Review with git diff, commit when ready.`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
