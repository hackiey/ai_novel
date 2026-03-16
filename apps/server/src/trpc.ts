import { initTRPC } from "@trpc/server";
import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { Db } from "mongodb";
import { getDb } from "./db.js";

export interface Context {
  db: Db;
}

export function createContext(_opts: CreateFastifyContextOptions): Context {
  return {
    db: getDb(),
  };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
