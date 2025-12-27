import gameConfig from "../gameConfig.json";

const FILE_EXTENSIONS = gameConfig?.app?.fileExtensions ?? {};

function normalizeExtension(extension, fallbackExtension = "") {
  const trimmed =
    typeof extension === "string" && extension.trim().length > 0
      ? extension.trim()
      : "";
  const fallback =
    trimmed ||
    (typeof fallbackExtension === "string" ? fallbackExtension.trim() : "");
  if (!fallback) {
    return "";
  }
  return fallback.startsWith(".") ? fallback : `.${fallback}`;
}

function moduleToUrl(mod) {
  if (typeof mod === "string") return mod;
  if (mod && typeof mod === "object") {
    if (typeof mod.default === "string") {
      return mod.default;
    }
    if (typeof mod.url === "string") {
      return mod.url;
    }
  }
  return null;
}

function endsWithFilename(path, filename) {
  if (!path || !filename) return false;
  const normalizedPath = path.toLowerCase();
  const normalizedFilename = filename.toLowerCase();
  return (
    normalizedPath.endsWith(`/${normalizedFilename}`) ||
    normalizedPath.endsWith(`\\${normalizedFilename}`) ||
    normalizedPath === normalizedFilename
  );
}

function matchesBaseName(path, baseName) {
  if (!path || !baseName) return false;
  const fileName = path.split(/[\\/]/).pop() || "";
  return fileName.toLowerCase().startsWith(baseName.toLowerCase());
}

export function getFileExtension(key, fallbackExtension = "") {
  return normalizeExtension(FILE_EXTENSIONS?.[key], fallbackExtension);
}

export function resolveAssetFromGlob(
  modules,
  baseName,
  { extension, fallbackExtension, matchBaseNameOnly = true } = {}
) {
  if (!modules || !baseName) return null;
  const preferredExtension = normalizeExtension(extension, fallbackExtension);
  const secondaryExtension = normalizeExtension(
    fallbackExtension,
    preferredExtension
  );
  const candidateFilenames = [];

  if (preferredExtension) {
    candidateFilenames.push(`${baseName}${preferredExtension}`);
  }
  if (
    secondaryExtension &&
    secondaryExtension !== preferredExtension &&
    !candidateFilenames.includes(`${baseName}${secondaryExtension}`)
  ) {
    candidateFilenames.push(`${baseName}${secondaryExtension}`);
  }

  for (const candidate of candidateFilenames) {
    for (const [path, mod] of Object.entries(modules)) {
      if (!endsWithFilename(path, candidate)) continue;
      const url = moduleToUrl(mod);
      if (url) {
        return url;
      }
    }
  }

  if (matchBaseNameOnly) {
    for (const [path, mod] of Object.entries(modules)) {
      if (!matchesBaseName(path, baseName)) continue;
      const url = moduleToUrl(mod);
      if (url) {
        return url;
      }
    }
  }

  return null;
}

export function filterEntriesByExtension(
  entries,
  extension,
  fallbackExtension = ""
) {
  if (!Array.isArray(entries)) {
    return [];
  }
  const preferredExtension = normalizeExtension(extension, fallbackExtension);
  const secondaryExtension = normalizeExtension(
    fallbackExtension,
    preferredExtension
  );

  const matchesPreferred = entries.filter(([path]) =>
    preferredExtension ? path.toLowerCase().endsWith(preferredExtension) : false
  );
  if (matchesPreferred.length) {
    return matchesPreferred;
  }

  const matchesFallback = entries.filter(([path]) =>
    secondaryExtension ? path.toLowerCase().endsWith(secondaryExtension) : false
  );
  if (matchesFallback.length) {
    return matchesFallback;
  }

  return entries;
}
