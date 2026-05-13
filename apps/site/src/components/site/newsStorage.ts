"use client";

import type { NewsItem } from "@ir/types";
import { expandedNewsData } from "./content";
import type { CategorySlug } from "@ir/types";

const DB_NAME = "ir_site_db";
const STORE_NAME = "news";
const KEY = "items_v1";
const DB_VERSION = 2;

export type FeaturedZone = "nenhum" | "hero-principal" | "hero-secundario" | "topo-categoria";
export type PublishMode = "agora" | "programada";

export interface CmsNewsItem extends NewsItem {
  menuCategory: CategorySlug;
  featuredZone: FeaturedZone;
  publishMode: PublishMode;
  scheduledFor?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("ads")) {
        db.createObjectStore("ads");
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function normalizeItem(item: NewsItem): CmsNewsItem {
  return {
    ...item,
    menuCategory: item.category,
    featuredZone: item.isFeatured ? "hero-principal" : "nenhum",
    publishMode: "agora",
    scheduledFor: undefined
  };
}

export async function loadNewsItems(): Promise<CmsNewsItem[]> {
  const db = await openDb();
  return await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY);
    req.onsuccess = () => {
      const value = req.result as CmsNewsItem[] | undefined;
      if (Array.isArray(value) && value.length > 0) {
        resolve(value);
        return;
      }
      resolve(expandedNewsData.map(normalizeItem));
    };
    req.onerror = () => resolve(expandedNewsData.map(normalizeItem));
  });
}

export async function saveNewsItems(items: CmsNewsItem[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(items, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getPublishedNews(items: CmsNewsItem[], nowIso = new Date().toISOString()): CmsNewsItem[] {
  const now = new Date(nowIso).getTime();
  return items
    .filter((item) => {
      if (item.publishMode === "agora") return true;
      if (!item.scheduledFor) return false;
      return new Date(item.scheduledFor).getTime() <= now;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
