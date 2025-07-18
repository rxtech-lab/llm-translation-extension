// biome-ignore assist/source/organizeImports: <explanation>
import { describe, expect, it } from "vitest";
import type {
  Category,
  TokenUsage,
  TranslateProps,
  TranslateResult,
  Translator,
} from "./llm/translator";
import { PageTranslator, TranslationProgress } from "./pageTranslator";
import * as nunjucks from "nunjucks";

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
            template: "{{API}}",
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
      template: "{{API}}",
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
    translator.restoreOriginalText(element);
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

  it("should be able to replace terms", () => {
    const env = new nunjucks.Environment();
    const context = {
      React_Fundamentals: "React 基础",
      Workflow: "工作流",
      "UI_&_Interaction": "UI 与交互",
      Codegen: "代码生成",
      JavaScript_Runtime: "JavaScript 运行时",
      Legacy_Architecture: "遗留架构",
      components: "组件",
      Native_Components: "原生组件",
      views: "视图",
      platform_backed_components: "平台支持的组件",
      Core_Components: "核心组件",
      New_Architecture: "新架构",
      community_contributed_components: "社区贡献的组件",
      ecosystem: "生态系统",
      iOS_View: "iOS 视图",
      React_Native_UI_Component: "React Native UI 组件",
      Android_View: "Android 视图",
      accessibility_controls: "可访问性控件",
      A_generic_scrolling_container_that_can_contain_multiple_components_and_views:
        "一个通用的滚动容器，可以包含多个组件和视图",
      React_components: "React 组件",
      React_component_APIs: "React 组件 API",
      skip_ahead: "跳到下一部分",
      next_release: "下个版本",
      on: "于",
      Next: "下一篇",
      mobile_development: "移动开发",
      API: "API",
      Components: "组件",
      Skip_to_main_content: "跳至主要内容",
      Community: "社区",
      Contributing: "贡献",
      Showcase: "展示",
    };

    const template = "{{React_Fundamentals}}";
    const rendered = env.renderString(template, context);
    expect(rendered).toBe("React 基础");
  });
});

describe("html replacement", () => {
  class MockTranslator implements Translator {
    async translateText(props: TranslateProps): Promise<TranslateResult> {
      if (
        props.currentText.includes(
          "From July 4 through July 7, 2025, a large and deadly"
        )
      ) {
        return {
          translatedText:
            "在2025年7月4日至7月7日期间,{{Texas_Hill_Country}}发生了一场大规模且致命的",
          terms: [
            {
              original: "Texas_Hill_Country",
              translated: "德克萨斯州山地",
              description: "A region in the U.S. state of Texas",
              template: "{{Texas_Hill_Country}}",
            },
          ],
        };
      }

      if (props.currentText.includes("flood")) {
        return {
          translatedText: "{{flood}}事件",
          terms: [
            {
              original: "flood",
              translated: "洪水",
              description: "A natural disaster caused by heavy rain",
              template: "{{flood}}",
            },
          ],
        };
      }

      if (props.currentText.includes("event took place in the")) {
        return {
          translatedText: "这场事件发生在",
          terms: [],
        };
      }

      if (props.currentText.includes("Texas_Hill_Country")) {
        return {
          translatedText: "Texas_Hill_Country",
          terms: [
            {
              original: "Texas_Hill_Country",
              translated: "德克萨斯州山地",
              description: "A region in the U.S. state of Texas",
              template: "Texas_Hill_Country",
            },
          ],
        };
      }

      if (props.currentText.includes("particularly in")) {
        return {
          translatedText: "特别是在",
          terms: [],
        };
      }

      if (props.currentText.includes("Kerr_County")) {
        return {
          translatedText: "Kerr_County",
          terms: [
            {
              original: "Kerr_County",
              translated: "克尔县",
              description: "A county in the U.S. state of Texas",
              template: "Kerr_County",
            },
          ],
        };
      }

      if (props.currentText.includes(", in the U.S. state of")) {
        return {
          translatedText: "在美国{{Texas}}州",
          terms: [
            {
              original: "Texas",
              translated: "德克萨斯州",
              description: "A state in the U.S.",
              template: "Texas",
            },
          ],
        };
      }

      if (props.currentText.includes("Texas")) {
        return {
          translatedText: "{{Texas}}",
          terms: [
            {
              original: "Texas",
              translated: "德克萨斯州",
              description: "A state in the U.S.",
              template: "Texas",
            },
          ],
        };
      }

      return {
        translatedText: "",
        terms: [],
      };
    }
    translateTerms(
      category: Category,
      signal?: AbortSignal
    ): Promise<{ updatedCategory: Category; usage: TokenUsage }> {
      throw new Error("Method not implemented.");
    }
  }

  it("should translate terms", async () => {
    const translator = new PageTranslator(new MockTranslator());
    const element = document.createElement("div");
    element.innerHTML = `
    <p>From July 4 through July 7, 2025, a large and deadly <a href="/wiki/Flood" title="Flood">flood</a> event took place in the <a href="/wiki/Texas_Hill_Country" title="Texas Hill Country">Texas Hill Country</a>.
    </p>`;

    let results: TranslationProgress[] = [];
    for await (const result of translator.translate(element)) {
      results.push(result);
    }
    expect(results.length).toBe(5);
    const finalTranslatedText = element.textContent?.trim();
    expect(finalTranslatedText).toContain(
      "在2025年7月4日至7月7日期间,德克萨斯州山地发生了一场大规模且致命的洪水事件这场事件发生在德克萨斯州."
    );

    translator.restoreOriginalText(element);

    expect(element.textContent).toContain(
      "From July 4 through July 7, 2025, a large and deadly flood event took place in the Texas Hill Country"
    );

    // translate again
    results = [];
    console.log(
      "Text nodes before second translation:",
      translator.collectTextNodes(element).length
    );
    for await (const result of translator.translate(element)) {
      results.push(result);
    }
    expect(results.length).toBe(5);
    expect(element.textContent).toContain(
      "在2025年7月4日至7月7日期间,德克萨斯州山地发生了一场大规模且致命的洪水事件这场事件发生在德克萨斯州."
    );
  });
});
