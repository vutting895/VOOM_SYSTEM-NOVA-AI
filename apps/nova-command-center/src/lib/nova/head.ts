export function pageHead(title: string, description: string) {
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
