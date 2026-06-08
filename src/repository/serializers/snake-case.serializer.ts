function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

export function serializeToSnakeCase<T = unknown>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(serializeToSnakeCase) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        toSnakeCase(key),
        serializeToSnakeCase(val),
      ]),
    ) as T
  }
  return value
}
