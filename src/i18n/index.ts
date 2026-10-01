import { useSyncExternalStore } from "react";
import czech from "./translations.cs.json";

export type Language = "en" | "cs";
const storageKey = "digita.language";
const translations: Record<string, string> = czech;
// Also recognize messages from older pilot backends while they are being updated.
const english = new Map(
  Object.entries(translations).map(([en, cs]) => [cs, en]),
);
const listeners = new Set<() => void>();
function readLanguage(): Language {
  try {
    return localStorage.getItem(storageKey) === "cs" ? "cs" : "en";
  } catch {
    return "en";
  }
}
let language = readLanguage();
function updateDocument() {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}
updateDocument();
export function getLanguage() {
  return language;
}
export function setLanguage(next: Language): boolean {
  let saved = true;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    saved = false;
  }
  language = next;
  updateDocument();
  listeners.forEach((listener) => listener());
  return saved;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useTranslation() {
  return useSyncExternalStore(subscribe, getLanguage, () => "en" as Language);
}
export function dateLocale() {
  return language === "cs" ? "cs-CZ" : "en-US";
}
export function canonicalMessage(message: string) {
  return english.get(message) ?? message;
}

export function t(
  message: string,
  values: Record<string, string | number> = {},
): string {
  const key = message.trim();
  const canonical = english.get(key) ?? key;
  const translated =
    language === "cs" && Object.hasOwn(translations, canonical)
      ? translations[canonical]
      : canonical;
  return (
    message.slice(0, message.length - message.trimStart().length) +
    translated.replace(/\{(\w+)\}/g, (match, name) =>
      Object.hasOwn(values, name) ? String(values[name]) : match,
    ) +
    message.slice(message.trimEnd().length)
  );
}
