// biome-ignore assist/source/organizeImports: <explanation>
import { PageTranslator } from "./pageTranslator";
import type {
  Translator,
  TranslateProps,
  TranslateResult,
  Category,
  TokenUsage,
} from "./llm/translator";
import { describe, expect, it } from "vitest";

class MockTranslator implements Translator {
  async translateText(props: TranslateProps): Promise<TranslateResult> {
    const { currentText } = props;

    // Mock translation: just add "[TRANSLATED]" prefix
    const translatedText = `[TRANSLATED] ${currentText}`;

    // Mock terms extraction
    const terms = currentText.includes("API")
      ? [
          {
            original: "API",
            translated: "接口",
            description: "Application Programming Interface",
          },
        ]
      : [];

    return {
      translatedText,
      terms,
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    };
  }

  async translateTerms(
    category: Category,
    signal?: AbortSignal
  ): Promise<{ updatedCategory: Category; usage: TokenUsage }> {
    // Mock term translation: preserve already translated terms, or add "[TERM]" prefix to untranslated terms
    const translatedTerms = category.terms.map((term) => ({
      ...term,
      translated: term.translated || `[TERM] ${term.original}`,
    }));

    return {
      updatedCategory: {
        ...category,
        terms: translatedTerms,
      },
      usage: {
        promptTokens: 5,
        completionTokens: 3,
        totalTokens: 8,
      },
    };
  }
}

describe("PageTranslator", () => {
  it("should collect text nodes", () => {
    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);
    const textNodes = translator.collectTextNodes(document.body);
    expect(textNodes.length).toBe(0);
  });

  it("should be able to collect multiple text nodes", () => {
    const element = document.createElement("div");
    element.innerHTML = "<p>Text 1</p><p>Text 2</p>";
    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);
    const textNodes = translator.collectTextNodes(element);
    expect(textNodes.length).toBe(2);
    expect(textNodes[0].textContent).toBe("Text 1");
    expect(textNodes[1].textContent).toBe("Text 2");
  });

  it("should be able to collect multiple text nodes with mixed content", () => {
    const element = document.createElement("div");
    element.innerHTML = "Text 1<p>Text 2</p>";
    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);
    const textNodes = translator.collectTextNodes(element);
    expect(textNodes.length).toBe(2);
    expect(textNodes[0].textContent).toBe("Text 1");
    expect(textNodes[1].textContent).toBe("Text 2");
  });

  it("should skip script and style tags", () => {
    const element = document.createElement("div");
    element.innerHTML = `
			<p>Visible text</p>
			<script>console.log('hidden');</script>
			<style>body { color: red; }</style>
			<span>Another visible text</span>
		`;
    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);
    const textNodes = translator.collectTextNodes(element);
    expect(textNodes.length).toBe(2);
    expect(textNodes[0].textContent).toBe("Visible text");
    expect(textNodes[1].textContent).toBe("Another visible text");
  });

  it("should translate text nodes using async generator", async () => {
    const element = document.createElement("div");
    element.innerHTML = "<p>Hello world</p><p>Test API call</p>";

    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);
    const progressUpdates: unknown[] = [];
    let finalResult: unknown;

    // Use the generator manually to capture both yields and return value
    const generator = translator.translate(element);
    let result = await generator.next();

    while (!result.done) {
      progressUpdates.push(result.value);
      result = await generator.next();
    }

    // eslint-disable-next-line prefer-const
    finalResult = result.value;

    // Should have progress updates for each text node plus terms translation
    expect(progressUpdates.length).toBeGreaterThan(2);

    // First update should show initial state
    expect(progressUpdates[0]).toMatchObject({
      current: 0,
      total: 2,
    });

    // Final result should contain translated HTML and terms
    expect(finalResult).toHaveProperty("finalHtml");
    expect(finalResult).toHaveProperty("terms");
    expect(finalResult).toHaveProperty("totalUsage");
    // @ts-expect-error Skip type checking for this test
    expect(finalResult.terms).toBeInstanceOf(Array);
    // @ts-expect-error Skip type checking for this test
    expect(finalResult.totalUsage.totalTokens).toBeGreaterThan(0);
  });

  it("should extract and translate terms", async () => {
    const element = document.createElement("div");
    element.innerHTML = "<p>Using API for data</p>";

    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);

    // Use the generator manually to capture return value
    const generator = translator.translate(element);
    let result = await generator.next();

    while (!result.done) {
      result = await generator.next();
    }

    const finalResult = result.value;

    // Should have extracted and translated the "API" term
    expect(finalResult.terms).toHaveLength(1);
    expect(finalResult.terms[0].name).toBe("General");
    expect(finalResult.terms[0].terms).toContainEqual({
      original: "API",
      translated: "接口",
      description: "Application Programming Interface",
    });
  });

  it("should handle translation errors gracefully", async () => {
    const element = document.createElement("div");
    element.innerHTML = "<p>Test text</p>";

    const errorTranslator: Translator = {
      async translateText(): Promise<TranslateResult> {
        throw new Error("Translation failed");
      },
      async translateTerms(
        category: Category,
        signal?: AbortSignal
      ): Promise<{ updatedCategory: Category; usage: TokenUsage }> {
        return {
          updatedCategory: category,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
    };

    const translator = new PageTranslator(errorTranslator);

    const progressUpdates: unknown[] = [];
    for await (const progress of translator.translate(element)) {
      progressUpdates.push(progress);
    }

    // Should contain error in progress updates
    const errorUpdate = progressUpdates.find((update: any) => update.error);
    expect(errorUpdate).toBeDefined();
    expect((errorUpdate as any).error).toBe("Translation failed");
  });

  it("should restore original text", async () => {
    const element = document.createElement("div");
    element.innerHTML = "<p>Original text</p>";

    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);

    // Store original text
    const originalText = element.textContent;

    // Translate
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of translator.translate(element)) {
      // Process translation
    }

    // Text should be translated
    expect(element.textContent).toBe("[TRANSLATED] Original text");

    // Restore original
    translator.restoreOriginalText();
    expect(element.textContent).toBe(originalText);
  });

  it("should skip short text nodes", async () => {
    const element = document.createElement("div");
    element.innerHTML = "<p>A</p><p>Hello world</p>"; // "A" is too short

    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);

    const progressUpdates: unknown[] = [];
    for await (const progress of translator.translate(element)) {
      progressUpdates.push(progress);
    }

    // Should have processed 2 nodes but only translated the longer one
    const translationUpdates = progressUpdates.filter(
      (update: any) =>
        update.translatedText && update.translatedText.includes("[TRANSLATED]")
    );
    expect(translationUpdates).toHaveLength(1);
    expect((translationUpdates[0] as any).translatedText).toBe(
      "[TRANSLATED] Hello world"
    );
  });

  it("should replace terms in final HTML", async () => {
    const element = document.createElement("div");
    element.innerHTML =
      "<p>Using API for data processing</p><span>The API endpoint</span>";

    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);

    // Use the generator manually to capture return value
    const generator = translator.translate(element);
    let result = await generator.next();

    while (!result.done) {
      result = await generator.next();
    }

    const finalResult = result.value;

    // The final HTML should have replaced "API" with "接口"
    expect(finalResult.finalHtml).toContain("接口");
    expect(finalResult.finalHtml).not.toContain("API");

    // Check that the structure is preserved (accounting for data-translation attributes)
    expect(finalResult.finalHtml).toContain('<p data-translation="true">');
    expect(finalResult.finalHtml).toContain('<span data-translation="true">');
    expect(finalResult.finalHtml).toContain("data processing");
    expect(finalResult.finalHtml).toContain("endpoint");
  });

  it("should handle multiple term replacements in HTML", async () => {
    // Create a mock translator that extracts multiple terms
    const multiTermTranslator: Translator = {
      async translateText(props: TranslateProps): Promise<TranslateResult> {
        const { currentText } = props;
        const translatedText = `[TRANSLATED] ${currentText}`;

        // Extract different terms based on content
        const terms = [];
        if (currentText.includes("API")) {
          terms.push({
            original: "API",
            translated: "接口",
            description: "Application Programming Interface",
          });
        }
        if (currentText.includes("user")) {
          terms.push({
            original: "user",
            translated: "用户",
            description: "A person who uses the system",
          });
        }

        return {
          translatedText,
          terms,
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
      },
      async translateTerms(
        category: Category,
        signal?: AbortSignal
      ): Promise<{ updatedCategory: Category; usage: TokenUsage }> {
        const translatedTerms = category.terms.map((term) => ({
          ...term,
          translated: term.translated || `[TERM] ${term.original}`,
        }));

        return {
          updatedCategory: { ...category, terms: translatedTerms },
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        };
      },
    };

    const element = document.createElement("div");
    element.innerHTML =
      "<p>The user calls the API</p><div>API user guide</div>";

    const translator = new PageTranslator(multiTermTranslator);

    // Use the generator manually to capture return value
    const generator = translator.translate(element);
    let result = await generator.next();

    while (!result.done) {
      result = await generator.next();
    }

    const finalResult = result.value;

    // Both terms should be replaced in the final HTML
    expect(finalResult.finalHtml).toContain("用户");
    expect(finalResult.finalHtml).toContain("接口");
    expect(finalResult.finalHtml).not.toContain("API");
    expect(finalResult.finalHtml).not.toContain("user");

    // Should contain both terms in the terms array
    expect(finalResult.terms[0].terms).toHaveLength(2);
  });

  it("should preserve HTML structure after term replacement", async () => {
    const element = document.createElement("div");
    element.innerHTML = `
      <h1>API Documentation</h1>
      <p class="intro">Welcome to our API guide</p>
      <div data-testid="content">
        <span>API usage examples</span>
      </div>
    `;

    const mockTranslator = new MockTranslator();
    const translator = new PageTranslator(mockTranslator);

    const generator = translator.translate(element);
    let result = await generator.next();

    while (!result.done) {
      result = await generator.next();
    }

    const finalResult = result.value;

    // HTML structure should be preserved (accounting for data-translation attributes)
    expect(finalResult.finalHtml).toContain('<h1 data-translation="true">');
    expect(finalResult.finalHtml).toContain('class="intro"');
    expect(finalResult.finalHtml).toContain('data-testid="content"');
    expect(finalResult.finalHtml).toContain('<span data-translation="true">');

    // Terms should be replaced
    expect(finalResult.finalHtml).toContain("接口");
    expect(finalResult.finalHtml).not.toContain("API");
  });
});
