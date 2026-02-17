/**
 * @module @dreamer/socket-io/i18n
 *
 * 服务端 i18n：日志、错误、警告等文案的国际化。
 * 未传 lang 时从环境变量（LANGUAGE/LC_ALL/LANG）自动检测语言。
 */

import {
  $i18n,
  getGlobalI18n,
  getI18n,
  type TranslationData,
  type TranslationParams,
} from "@dreamer/i18n";
import { getEnv } from "@dreamer/runtime-adapter";
import enUS from "./locales/en-US.json" with { type: "json" };
import zhCN from "./locales/zh-CN.json" with { type: "json" };

/** 支持的 locale */
export type Locale = "en-US" | "zh-CN";

/** 检测失败时使用的默认 locale */
export const DEFAULT_LOCALE: Locale = "en-US";

const SOCKET_IO_LOCALES: Locale[] = ["en-US", "zh-CN"];

let socketIoTranslationsLoaded = false;

/**
 * 检测当前语言：LANGUAGE > LC_ALL > LANG。
 * 未设置或不在支持列表中时返回 DEFAULT_LOCALE。
 */
export function detectLocale(): Locale {
  const langEnv = getEnv("LANGUAGE") || getEnv("LC_ALL") || getEnv("LANG");
  if (!langEnv) return DEFAULT_LOCALE;
  const first = langEnv.split(/[:\s]/)[0]?.trim();
  if (!first) return DEFAULT_LOCALE;
  const match = first.match(/^([a-z]{2})[-_]([A-Z]{2})/i);
  if (match) {
    const normalized = `${match[1].toLowerCase()}-${
      match[2].toUpperCase()
    }` as Locale;
    if (SOCKET_IO_LOCALES.includes(normalized)) return normalized;
  }
  const primary = first.substring(0, 2).toLowerCase();
  if (primary === "zh") return "zh-CN";
  if (primary === "en") return "en-US";
  return DEFAULT_LOCALE;
}

/**
 * 将 socket-io 文案加载到当前 I18n 实例（仅加载一次）。
 */
export function ensureSocketIoI18n(): void {
  if (socketIoTranslationsLoaded) return;
  const i18n = getGlobalI18n() ?? getI18n();
  i18n.loadTranslations("en-US", enUS as TranslationData);
  i18n.loadTranslations("zh-CN", zhCN as TranslationData);
  socketIoTranslationsLoaded = true;
}

/**
 * 加载文案并设置当前 locale。在入口（如 mod）中调用一次即可。
 */
export function initSocketIoI18n(): void {
  ensureSocketIoI18n();
  $i18n.setLocale(detectLocale());
}

/**
 * 设置当前语言（供 Server 构造时 options.lang 使用）。
 * 调用后，$t() 将使用该 locale，无需每次传 lang。
 */
export function setSocketIoLocale(lang: Locale): void {
  ensureSocketIoI18n();
  $i18n.setLocale(lang);
}

/**
 * 按 key 翻译。未传 lang 时使用当前 locale（在入口处已设置）。
 * 不要在 $t 内部调用 ensure/init；在入口调用 initSocketIoI18n()。
 */
export function $t(
  key: string,
  params?: TranslationParams,
  lang?: Locale,
): string {
  ensureSocketIoI18n();
  if (lang !== undefined) {
    const prev = $i18n.getLocale();
    $i18n.setLocale(lang);
    try {
      return $i18n.t(key, params);
    } finally {
      $i18n.setLocale(prev);
    }
  }
  return $i18n.t(key, params);
}
