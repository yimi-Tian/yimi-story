import registry from "../../../data/digital-walks.json";

export interface DigitalWalkOption { id: string; title: string }

export interface DigitalWalkRegistryEntry extends DigitalWalkOption { approvedAndPublic: boolean }

type RouteLike = { id: string; title: string; publicationStatus: string; publiclyListed: boolean };

export function selectPublishedDigitalWalkOptions(routes: RouteLike[]): DigitalWalkOption[] {
  return routes.filter((route) => route.publicationStatus === "approved" && route.publiclyListed === true)
    .map((route) => ({ id: route.id, title: route.title }))
    .sort((left, right) => left.id.localeCompare(right.id, "zh-TW"));
}
export function findDigitalWalk(id: string): DigitalWalkRegistryEntry | null {
  const route = registry.routes.find((item) => item.id === id);
  return route ? { id: route.id, title: route.title, approvedAndPublic: route.publicationStatus === "approved" && route.publiclyListed === true } : null;
}

export function getPublishedDigitalWalkOptions(): DigitalWalkOption[] {
  return selectPublishedDigitalWalkOptions(registry.routes);
}
