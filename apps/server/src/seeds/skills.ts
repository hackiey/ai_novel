import type { Db } from "mongodb";

const builtinSkills = [
  {
    name: "world-building",
    description: "引导构建完整的世界观体系，包括地理、历史、社会制度、魔法/科技体系等。当用户想要从零开始创建世界观，或者需要系统性地完善现有世界观时使用。",
    content: `# 世界观构建 Skill

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
    tags: ["world"],
    isBuiltin: true,
    isPublished: true,
    disableModelInvocation: false,
    userInvocable: true,
  },
];

export async function seedBuiltinSkills(db: Db): Promise<void> {
  const collection = db.collection("skills");

  // Ensure index on name
  await collection.createIndex({ name: 1 }, { unique: true });

  // Drop old skillId index if it exists
  try {
    await collection.dropIndex("skillId_1");
  } catch {
    // Index may not exist, ignore
  }

  for (const skill of builtinSkills) {
    await collection.updateOne(
      { name: skill.name },
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

  // Clean up old skillId-based documents that were replaced
  await collection.deleteMany({ skillId: { $exists: true }, name: { $exists: false } });

  console.log(`Seeded ${builtinSkills.length} builtin skill(s)`);
}
