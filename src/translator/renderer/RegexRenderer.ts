import type { Renderer, RendererConfig } from "./types";

/**
 * A regex-based template renderer that replaces variable placeholders
 * with values from a context object
 */
export class RegexRenderer implements Renderer {
  private readonly config: Required<RendererConfig>;

  /**
   * Default pattern matches {{variable_name}} format
   */
  private static readonly DEFAULT_PATTERN = /\{\{([^}]+)\}\}/g;

  constructor(config: RendererConfig = {}) {
    this.config = {
      strictMode: config.strictMode ?? false,
      variablePattern: config.variablePattern ?? RegexRenderer.DEFAULT_PATTERN,
      escapeValues: config.escapeValues ?? false,
    };
  }

  /**
   * Renders a template by replacing variable placeholders with context values
   * @param template - Template string with {{variable}} placeholders
   * @param context - Object containing variable values
   * @returns Rendered string with variables replaced
   * @throws Error if strictMode is enabled and variables are missing
   */
  render(template: string, context: Record<string, string>): string {
    if (!template) {
      return template;
    }

    const missingVariables: string[] = [];

    const result = template.replace(
      this.config.variablePattern,
      (match, variableName) => {
        // Clean up variable name (trim whitespace)
        const cleanVariableName = variableName.trim();

        if (cleanVariableName in context) {
          const value = context[cleanVariableName];
          return this.config.escapeValues ? this.escapeHtml(value) : value;
        }

        // Variable not found in context
        if (this.config.strictMode) {
          missingVariables.push(cleanVariableName);
        }

        // Return original placeholder if not in strict mode
        return match;
      }
    );

    if (this.config.strictMode && missingVariables.length > 0) {
      throw new Error(
        `Missing variables in template: ${missingVariables.join(", ")}`
      );
    }

    return result;
  }

  /**
   * Escapes HTML special characters in a string
   * @param text - The text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return text.replace(/[&<>"']/g, (match) => htmlEscapes[match] || match);
  }

  /**
   * Gets the current configuration
   * @returns Current renderer configuration
   */
  getConfig(): Required<RendererConfig> {
    return { ...this.config };
  }

  /**
   * Creates a new renderer with updated configuration
   * @param newConfig - Configuration updates
   * @returns New renderer instance with merged configuration
   */
  withConfig(newConfig: Partial<RendererConfig>): RegexRenderer {
    return new RegexRenderer({ ...this.config, ...newConfig });
  }
}
