export function hasMatchingConfiguredLabel(
  labels: readonly string[],
  configuredLabels: readonly string[]
): boolean {
  const normalizedLabels = labels.map((label) => label.toLowerCase());

  return configuredLabels.some((configuredLabel) => {
    const normalized = configuredLabel.toLowerCase();

    if (normalized.endsWith('*')) {
      const prefix = normalized.slice(0, -1);
      return normalizedLabels.some((label) => label.startsWith(prefix));
    }

    return normalizedLabels.includes(normalized);
  });
}
