import { MongoClient, Db, Collection, Document } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDb(uri: string): Promise<Db> {
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  console.log(`Connected to MongoDB: ${db.databaseName}`);
  return db;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("Disconnected from MongoDB");
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return db;
}

export function getCollection<T extends Document = Document>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return client;
}
