import { describe, it, expect } from "vitest";
import { RegexRenderer } from "./RegexRenderer";

describe("RegexRenderer", () => {
  describe("render", () => {
    it("should replace single variable in template", () => {
      const renderer = new RegexRenderer();
      const template = "Hello {{name}}!";
      const context = { name: "World" };

      const result = renderer.render(template, context);

      expect(result).toBe("Hello World!");
    });

    it("should replace multiple variables in template", () => {
      const renderer = new RegexRenderer();
      const template = "{{greeting}} {{name}}, how are you {{status}}?";
      const context = {
        greeting: "Hello",
        name: "Alice",
        status: "today",
      };

      const result = renderer.render(template, context);

      expect(result).toBe("Hello Alice, how are you today?");
    });

    it("should handle the same variable used multiple times", () => {
      const renderer = new RegexRenderer();
      const template = "{{name}} loves {{name}}";
      const context = { name: "JavaScript" };

      const result = renderer.render(template, context);

      expect(result).toBe("JavaScript loves JavaScript");
    });

    it("should leave unknown variables unchanged when not in strict mode", () => {
      const renderer = new RegexRenderer({ strictMode: false });
      const template = "Hello {{name}}, welcome to {{place}}!";
      const context = { name: "Bob" };

      const result = renderer.render(template, context);

      expect(result).toBe("Hello Bob, welcome to {{place}}!");
    });

    it("should throw error for unknown variables in strict mode", () => {
      const renderer = new RegexRenderer({ strictMode: true });
      const template = "Hello {{name}}, welcome to {{place}}!";
      const context = { name: "Bob" };

      expect(() => renderer.render(template, context)).toThrow(
        "Missing variables in template: place"
      );
    });

    it("should handle empty template", () => {
      const renderer = new RegexRenderer();
      const result = renderer.render("", {});
      expect(result).toBe("");
    });

    it("should handle template with no variables", () => {
      const renderer = new RegexRenderer();
      const template = "This is a plain text.";
      const result = renderer.render(template, {});
      expect(result).toBe("This is a plain text.");
    });

    it("should trim whitespace in variable names", () => {
      const renderer = new RegexRenderer();
      const template = "{{ name }} and {{  age  }}";
      const context = { name: "John", age: "25" };

      const result = renderer.render(template, context);

      expect(result).toBe("John and 25");
    });

    it("should escape HTML when escapeValues is enabled", () => {
      const renderer = new RegexRenderer({ escapeValues: true });
      const template = "Hello {{name}}!";
      const context = { name: "<script>alert('xss')</script>" };

      const result = renderer.render(template, context);

      expect(result).toBe(
        "Hello &lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;!"
      );
    });

    it("should not escape HTML when escapeValues is disabled", () => {
      const renderer = new RegexRenderer({ escapeValues: false });
      const template = "Hello {{name}}!";
      const context = { name: "<strong>Bold Text</strong>" };

      const result = renderer.render(template, context);

      expect(result).toBe("Hello <strong>Bold Text</strong>!");
    });
  });

  describe("withConfig", () => {
    it("should create new instance with merged configuration", () => {
      const original = new RegexRenderer({ strictMode: false });
      const updated = original.withConfig({ strictMode: true });

      expect(original.getConfig().strictMode).toBe(false);
      expect(updated.getConfig().strictMode).toBe(true);
    });
  });

  describe("getConfig", () => {
    it("should return current configuration", () => {
      const renderer = new RegexRenderer({
        strictMode: true,
        escapeValues: true,
      });

      const config = renderer.getConfig();

      expect(config.strictMode).toBe(true);
      expect(config.escapeValues).toBe(true);
    });
  });
});
