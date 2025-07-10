/**
 * Interface for rendering templates with context variables
 */
export interface Renderer {
  /**
   * Renders a template with the provided context
   * @param template - The template string containing placeholders
   * @param context - Object containing key-value pairs for replacement
   * @returns The rendered string with placeholders replaced
   * @throws Error if rendering fails
   */
  render(template: string, context: Record<string, string>): string;
}

/**
 * Configuration options for renderers
 */
export interface RendererConfig {
  /**
   * Whether to throw errors on missing variables or silently ignore them
   */
  strictMode?: boolean;

  /**
   * Custom pattern for variable placeholders (defaults vary by implementation)
   */
  variablePattern?: RegExp;

  /**
   * Whether to escape special characters in replacement values
   */
  escapeValues?: boolean;
}
