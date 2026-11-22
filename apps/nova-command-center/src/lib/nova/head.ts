import type { HeadConfig } from "@tanstack/react-router";

export function pageHead(title: string, description: string): HeadConfig {
  const fullTitle = `${title} — NOVA AI`;
  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
    ],
  };
}
