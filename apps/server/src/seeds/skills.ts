import type { Db } from "mongodb";

const builtinSkills = [
  {
    skillId: "world_building",
    name: { zh: "世界观构建", en: "World Building" },
    description: {
      zh: "引导构建完整的世界观体系，包括地理、历史、社会制度、魔法/科技体系等",
      en: "Guide building a complete world system including geography, history, social structure, magic/technology systems, etc.",
    },
    whenToUse: {
      zh: "当用户想要从零开始创建世界观，或者需要系统性地完善现有世界观时",
      en: "When the user wants to create a world from scratch, or systematically refine an existing world",
    },
    prompt: {
      zh: `# 世界观构建技能

请引导用户系统性地构建完整的世界观体系。按以下步骤操作：

## 步骤 1：了解现状
1. 使用 semantic_search 搜索当前世界观中已有的所有设定
2. 了解用户想要创作的故事类型（奇幻、科幻、现实、历史等）

## 步骤 2：确定核心框架
与用户讨论并确定以下核心要素：
- **世界基调**：写实/奇幻/科幻/混合？整体氛围是光明还是黑暗？
- **时代背景**：古代/中世纪/近代/未来/架空？
- **核心冲突**：推动故事发展的主要矛盾是什么？

## 步骤 3：逐层构建
根据故事类型，引导用户构建以下维度（按重要性排序）：

### 必要维度
1. **地理环境** — 主要场景、地形、气候
2. **社会结构** — 国家/组织、阶级制度、权力架构
3. **核心规则** — 魔法体系/科技水平/超自然规则（如适用）

### 推荐维度
4. **历史背景** — 重要历史事件、文明发展脉络
5. **文化习俗** — 语言、宗教、节日、禁忌
6. **经济体系** — 货币、贸易、资源分布

### 可选维度
7. **军事体系** — 武器、战术、军队编制
8. **日常生活** — 衣食住行、娱乐方式
9. **特殊物种/种族** — 非人类种族的特点和文化

## 步骤 4：创建设定
对于每个讨论确定的维度：
1. 使用 create_world_setting 创建世界观设定条目
2. 选择合适的 category（地理、历史、政治、魔法体系、科技、文化、组织等）
3. 根据对故事的重要程度设置 importance（core/major/minor）
4. 为每个设定编写清晰的 summary 和详细的 content

## 步骤 5：一致性检查
在构建过程中：
- 检查新设定与已有设定是否存在矛盾
- 确保各个维度之间的逻辑自洽
- 如发现不一致，主动提醒用户并提供修改建议

## 工作方式
- 不要一次性创建所有设定，而是与用户逐步讨论，每确定一个维度就创建对应的设定
- 主动提出启发性的问题，帮助用户思考他们可能忽略的方面
- 给出具体的建议和范例，而不是空泛的指导
- 在创建设定时使用丰富、具体的描述

请开始与用户讨论，了解他们想要构建什么样的世界。`,
      en: `# World Building Skill

Guide the user to systematically build a complete world system. Follow these steps:

## Step 1: Assess Current State
1. Use semantic_search to find all existing settings in the current world
2. Understand what type of story the user wants to create (fantasy, sci-fi, realistic, historical, etc.)

## Step 2: Establish Core Framework
Discuss with the user to determine these core elements:
- **World Tone**: Realistic / Fantasy / Sci-fi / Hybrid? Light or dark atmosphere?
- **Era**: Ancient / Medieval / Modern / Future / Alternative?
- **Core Conflict**: What is the main conflict driving the story?

## Step 3: Build Layer by Layer
Based on story type, guide the user through these dimensions (by importance):

### Essential Dimensions
1. **Geography** — Key locations, terrain, climate
2. **Social Structure** — Nations/organizations, class system, power hierarchy
3. **Core Rules** — Magic system / technology level / supernatural rules (if applicable)

### Recommended Dimensions
4. **History** — Major historical events, civilization development
5. **Culture & Customs** — Language, religion, festivals, taboos
6. **Economy** — Currency, trade, resource distribution

### Optional Dimensions
7. **Military** — Weapons, tactics, army organization
8. **Daily Life** — Food, clothing, shelter, entertainment
9. **Special Species/Races** — Non-human race characteristics and cultures

## Step 4: Create Settings
For each discussed dimension:
1. Use create_world_setting to create world setting entries
2. Choose appropriate category (Geography, History, Politics, Magic System, Technology, Culture, Organizations, etc.)
3. Set importance based on relevance to the story (core/major/minor)
4. Write clear summary and detailed content for each setting

## Step 5: Consistency Check
During the building process:
- Check new settings for contradictions with existing ones
- Ensure logical consistency across all dimensions
- If inconsistencies are found, proactively alert the user and suggest fixes

## Working Style
- Don't create all settings at once — discuss with the user step by step, creating settings as each dimension is finalized
- Ask thought-provoking questions to help the user consider aspects they may have overlooked
- Provide concrete suggestions and examples, not vague guidance
- Use rich, specific descriptions when creating settings

Begin by discussing with the user what kind of world they want to build.`,
    },
    arguments: [],
    tags: ["world"],
    isBuiltin: true,
    isPublished: true,
  },
];

export async function seedBuiltinSkills(db: Db): Promise<void> {
  const collection = db.collection("skills");

  // Ensure index on skillId
  await collection.createIndex({ skillId: 1 }, { unique: true });

  for (const skill of builtinSkills) {
    await collection.updateOne(
      { skillId: skill.skillId },
      {
        $set: {
          ...skill,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  console.log(`Seeded ${builtinSkills.length} builtin skill(s)`);
}
