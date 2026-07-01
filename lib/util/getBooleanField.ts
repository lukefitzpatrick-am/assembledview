/**
 * Read a boolean field supporting both snake_case and camelCase keys on a line item.
 */
export function getBooleanField(
  lineItem: any,
  snakeCase: string,
  camelCase: string,
  defaultValue: boolean = false
): boolean {
  const value = lineItem[snakeCase] !== undefined ? lineItem[snakeCase] : lineItem[camelCase];
  return value !== undefined ? value : defaultValue;
}
