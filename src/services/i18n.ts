// Interface language: translates the app's English UI text in the page, live, from a dictionary per language.
// Map content (names, labels, notes) and anything typed by the user is never touched
import de from "@/data/i18n/de.json";

export type Language = "en" | "de";
export const LANGUAGES: Record<Language, string> = { en: "English", de: "Deutsch" };

const DICTIONARIES: Record<Exclude<Language, "en">, Record<string, string>> = { de };
const STORAGE_KEY = "language";
const ATTRIBUTES = ["data-tip", "title", "placeholder", "aria-label"] as const;
const NUMBER = /\d+(?:[.,]\d+)*/g;
// user content and the map: names, labels and notes stay as they are
const SKIP = "svg, script, style, textarea, [contenteditable], .ql-editor, #notesEditor, #map, .notranslate";

let language: Language = "en";
let observer: MutationObserver | null = null;
const originalText = new WeakMap<Text, string>();
const originalAttribute = new WeakMap<Element, Map<string, string>>();
const shown = new WeakMap<Node, string>(); // what we last wrote, to tell our writes from the app's

/** The translation of an English UI string, numbers kept; the string itself when there is none */
export function translate(text: string, dictionary = DICTIONARIES[language as Exclude<Language, "en">]): string {
  if (!dictionary || !text) return text;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return text;
  const direct = dictionary[trimmed];
  if (direct !== undefined) return keepSpace(text, direct);
  const numbers = trimmed.match(NUMBER);
  if (!numbers) return text;
  const translated = dictionary[trimmed.replace(NUMBER, "{n}")];
  if (translated === undefined) return text;
  let index = 0;
  return keepSpace(
    text,
    translated.replace(/\{n\}/g, () => numbers[index++] ?? "")
  );
}

const keepSpace = (source: string, value: string) => {
  const lead = source.match(/^\s*/)?.[0] ?? "";
  const tail = source.match(/\s*$/)?.[0] ?? "";
  return lead + value + tail;
};

const skipped = (element: Element | null) => !element || !!element.closest(SKIP);

function translateText(node: Text): void {
  if (skipped(node.parentElement)) return;
  const current = node.nodeValue ?? "";
  if (shown.get(node) !== current) originalText.set(node, current); // the app wrote new text
  const source = originalText.get(node) ?? current;
  const next = language === "en" ? source : translate(source);
  if (next !== current) node.nodeValue = next;
  shown.set(node, next);
}

function translateAttributes(element: Element): void {
  if (skipped(element)) return;
  let originals = originalAttribute.get(element);
  for (const name of ATTRIBUTES) {
    const current = element.getAttribute(name);
    if (current === null) continue;
    originals ??= new Map();
    const lastShown = (shown.get(element) ?? "").split("\u0000")[ATTRIBUTES.indexOf(name)];
    if (lastShown !== current) originals.set(name, current);
    const next = language === "en" ? originals.get(name)! : translate(originals.get(name)!);
    if (next !== current) element.setAttribute(name, next);
  }
  if (originals) {
    originalAttribute.set(element, originals);
    shown.set(element, ATTRIBUTES.map(name => element.getAttribute(name) ?? "").join("\u0000"));
  }
  if (element instanceof HTMLInputElement && (element.type === "button" || element.type === "submit")) {
    const value = element.value;
    const next = language === "en" ? value : translate(value);
    if (next !== value) element.value = next;
  }
}

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateText(root as Text);
    return;
  }
  if (!(root instanceof Element) || root instanceof SVGElement || skipped(root)) return;
  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node =>
      node instanceof Element && (node instanceof SVGElement || node.matches(SKIP))
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node as Text);
    else translateAttributes(node as Element);
  }
}

function observe(): void {
  observer?.disconnect();
  observer = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target;
      if (target instanceof SVGElement) continue;
      if (record.type === "characterData") translateText(target as Text);
      else if (record.type === "attributes") translateAttributes(target as Element);
      else for (const node of record.addedNodes) translateTree(node);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTES]
  });
}

export function getLanguage(): Language {
  return language;
}

/** Switch the interface language; English restores the original text */
export function setLanguage(next: Language): void {
  language = next in LANGUAGES ? next : "en";
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {}
  document.documentElement.lang = language;
  translateTree(document.body);
  if (language === "en") {
    observer?.disconnect();
    observer = null;
  } else observe();
}

/** Apply the stored language once the page is there */
export function initLanguage(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {}
  if (stored && stored !== "en" && stored in LANGUAGES) setLanguage(stored as Language);
}
