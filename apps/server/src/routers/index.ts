import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { permissionGroupRouter } from "./permissionGroup.js";
import { projectRouter } from "./project.js";
import { characterRouter } from "./character.js";
import { worldRouter } from "./world.js";
import { worldSettingRouter } from "./worldSetting.js";
import { draftRouter } from "./draft.js";
import { chapterRouter } from "./chapter.js";
import { agentRouter } from "./agent.js";
import { searchRouter } from "./search.js";
import { shareRouter } from "./share.js";
import { settingsRouter } from "./settings.js";
import { exportImportRouter } from "./exportImport.js";

export const appRouter = router({
  auth: authRouter,
  permissionGroup: permissionGroupRouter,
  project: projectRouter,
  character: characterRouter,
  world: worldRouter,
  worldSetting: worldSettingRouter,
  draft: draftRouter,
  chapter: chapterRouter,
  agent: agentRouter,
  search: searchRouter,
  share: shareRouter,
  settings: settingsRouter,
  exportImport: exportImportRouter,
});

export type AppRouter = typeof appRouter;
