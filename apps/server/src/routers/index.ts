import { router } from "../trpc.js";
import { projectRouter } from "./project.js";
import { characterRouter } from "./character.js";
import { worldRouter } from "./world.js";
import { worldSettingRouter } from "./worldSetting.js";
import { draftRouter } from "./draft.js";
import { chapterRouter } from "./chapter.js";
import { agentRouter } from "./agent.js";
import { searchRouter } from "./search.js";

export const appRouter = router({
  project: projectRouter,
  character: characterRouter,
  world: worldRouter,
  worldSetting: worldSettingRouter,
  draft: draftRouter,
  chapter: chapterRouter,
  agent: agentRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;
