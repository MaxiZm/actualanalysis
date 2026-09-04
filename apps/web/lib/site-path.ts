/** Only plain URLs and image sources need this; Next Link prefixes its own paths. */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const staticSite = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
export function sitePath(path: string): string {
  return `${basePath}${path}`;
}
export function dataPath(path: string): string {
  return sitePath(
    staticSite && !path.includes("/download/") ? `${path}.json` : path,
  );
}
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://actualanalysis.org";
