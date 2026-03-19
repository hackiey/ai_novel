import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "ai_novel_api_url";

function getDefaultUrl(): string {
  if (Platform.OS === "android") {
    return "http://10.0.2.2:3001";
  }
  return "http://localhost:3001";
}

let cachedUrl: string | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  cachedUrl = stored || getDefaultUrl();
  return cachedUrl;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  cachedUrl = url;
  await AsyncStorage.setItem(STORAGE_KEY, url);
}

export function getApiBaseUrlSync(): string {
  return cachedUrl || getDefaultUrl();
}
