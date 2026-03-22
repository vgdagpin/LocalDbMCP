/**
 * Validates that a string is a safe SQL identifier.
 * Allows: letters, digits, underscores, and dollar signs only.
 * Rejects: brackets, quotes, semicolons, spaces, dots, etc.
 */
export function validateIdentifier(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    throw new Error(
      `Invalid identifier "${name}". Names must contain only letters, digits, ` +
        `underscores, and dollar signs, and must start with a letter or underscore.`
    );
  }
  if (name.length > 128) {
    throw new Error(`Identifier "${name}" is too long (max 128 characters).`);
  }
}
