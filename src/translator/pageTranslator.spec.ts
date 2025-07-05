// biome-ignore assist/source/organizeImports: <explanation>
import { PageTranslator } from "./pageTranslator";
import type {
  Translator,
  TranslateProps,
  TranslateResult,
  Category,
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
    };
  }

  async translateTerms(category: Category): Promise<Category> {
    // Mock term translation: just add "[TERM]" prefix
    const translatedTerms = category.terms.map((term) => ({
      ...term,
      translated: term.translated || `[TERM] ${term.original}`,
    }));

    return {
      ...category,
      terms: translatedTerms,
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
      cost: 0,
    });

    // Final result should contain translated HTML and terms
    expect(finalResult).toHaveProperty("finalHtml");
    expect(finalResult).toHaveProperty("terms");
    // @ts-expect-error Skip type checking for this test
    expect(finalResult.terms).toBeInstanceOf(Array);
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
      async translateTerms(category: Category): Promise<Category> {
        return category;
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
});
