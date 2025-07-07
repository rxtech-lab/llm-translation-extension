import type { Category, Terms, TokenUsage, Translator } from "./llm/translator";

export interface TranslationProgress {
  current: number;
  total: number;
  currentText?: string;
  translatedText?: string;
  usage?: TokenUsage;
  error?: string;
}

export interface TranslationResult {
  finalHtml: string;
  terms: Category[];
  totalUsage: TokenUsage;
}

export class PageTranslator {
  static readonly SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "CODE",
    "PRE",
    "INPUT",
    "BUTTON",
    "SELECT",
    "OPTION",
  ]);
  static readonly RX_LETTER = /\p{L}/u;
  static readonly MIN_TEXT_LENGTH = 2;
  static readonly DEFAULT_BATCH_SIZE = 5;

  private currentTerms: Category[] = [];
  private totalUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  private originalTextMap = new Map<Text, string>();

  constructor(
    private translator: Translator,
    private previousTerms: Category[] = [],
    private batchSize: number = PageTranslator.DEFAULT_BATCH_SIZE
  ) {
    this.currentTerms = this.previousTerms;
  }

  public async *translate(
    rootElement: HTMLElement,
    signal?: AbortSignal,
    timeout?: number
  ): AsyncGenerator<TranslationProgress, TranslationResult> {
    const textNodes = this.collectTextNodes(rootElement);
    const totalTexts = textNodes.map((node) => this.normalizeText(node));

    // Store original text for potential restoration
    textNodes.forEach((node) => {
      this.originalTextMap.set(node, node.nodeValue || "");
    });

    yield { current: 0, total: textNodes.length, usage: this.totalUsage };

    // Process nodes in batches
    let completedCount = 0;
    for (let i = 0; i < textNodes.length; i += this.batchSize) {
      const batch = textNodes.slice(i, i + this.batchSize);

      // Create translation promises for the batch
      const batchPromises = batch.map(async (node, batchIndex) => {
        const currentText = this.normalizeText(node);
        const globalIndex = i + batchIndex;

        if (
          !currentText ||
          currentText.length < PageTranslator.MIN_TEXT_LENGTH
        ) {
          return {
            success: true,
            node,
            currentText,
            translatedText: currentText,
            globalIndex,
            error: undefined,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
        }

        try {
          // Create timeout signal if timeout is specified
          const timeoutSignal = timeout
            ? AbortSignal.timeout(timeout)
            : undefined;
          const combinedSignal =
            signal && timeoutSignal
              ? AbortSignal.any([signal, timeoutSignal])
              : signal || timeoutSignal;

          const siblingText = this.getSiblingTexts(node);

          const result = await this.translator.translateText({
            currentText,
            siblingText,
            totalText: totalTexts,
            terms: this.currentTerms,
            signal: combinedSignal,
          });

          if (result.terms.length > 0) {
            this.addNewTerms(result.terms);
          }

          // Accumulate usage
          if (result.usage) {
            this.totalUsage.promptTokens += result.usage.promptTokens;
            this.totalUsage.completionTokens += result.usage.completionTokens;
            this.totalUsage.totalTokens += result.usage.totalTokens;
          }

          // Safely update the text node
          this.updateTextNode(node, result.translatedText);

          return {
            success: true,
            node,
            currentText,
            translatedText: result.translatedText,
            globalIndex,
            error: undefined,
            usage: result.usage || {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          };
        } catch (error) {
          return {
            success: false,
            node,
            currentText,
            translatedText: undefined,
            globalIndex,
            error:
              error instanceof Error ? error.message : "Translation failed",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          };
        }
      });

      // Wait for all promises in the batch to settle
      const batchResults = await Promise.allSettled(batchPromises);

      // Process results and yield progress
      for (const result of batchResults) {
        completedCount++;

        if (result.status === "fulfilled") {
          const translationResult = result.value;
          yield {
            current: completedCount,
            total: textNodes.length,
            currentText: translationResult.currentText,
            translatedText: translationResult.translatedText,
            usage: this.totalUsage,
            error: translationResult.error,
          };
        } else {
          // Handle rejected promise
          yield {
            current: completedCount,
            total: textNodes.length,
            currentText: "Unknown",
            error: "Batch processing failed",
            usage: this.totalUsage,
          };
        }
      }
    }

    // Translate terms
    yield {
      current: textNodes.length,
      total: textNodes.length + 1,
      currentText: "Translating terms...",
      usage: this.totalUsage,
    };

    await this.translateAllTerms(signal, timeout);

    const finalHtml = this.renderFinalTemplate(rootElement.outerHTML);

    return {
      finalHtml,
      terms: this.currentTerms,
      totalUsage: this.totalUsage,
    };
  }

  private updateTextNode(node: Text, translatedText: string): void {
    if (node.parentNode && node.nodeValue !== translatedText) {
      node.nodeValue = translatedText;
      // Mark parent element as translated
      if (node.parentElement) {
        node.parentElement.setAttribute("data-translation", "true");
      }
    }
  }

  private getSiblingTexts(node: Text): string[] {
    const siblings: string[] = [];
    const parent = node.parentElement;

    if (!parent) return siblings;

    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n === node) return NodeFilter.FILTER_SKIP;
        return this.acceptTextNodeFilter(n)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });

    while (walker.nextNode()) {
      const siblingText = this.normalizeText(walker.currentNode as Text);
      if (siblingText) {
        siblings.push(siblingText);
      }
    }

    return siblings.slice(0, 5); // Limit to 5 siblings
  }

  private addNewTerms(newTerms: Terms[]): void {
    if (newTerms.length === 0) return;

    let generalCategory = this.currentTerms.find(
      (cat) => cat.name === "General"
    );
    if (!generalCategory) {
      generalCategory = { name: "General", terms: [] };
      this.currentTerms.push(generalCategory);
    }

    newTerms.forEach((term) => {
      const exists = generalCategory!.terms.some(
        (t) => t.original === term.original
      );
      if (!exists) {
        generalCategory!.terms.push(term);
      }
    });
  }

  private async translateAllTerms(
    signal?: AbortSignal,
    timeout?: number
  ): Promise<void> {
    for (const category of this.currentTerms) {
      const untranslatedTerms = category.terms.filter(
        (term) => !term.translated
      );
      if (untranslatedTerms.length > 0) {
        try {
          // Create timeout signal if timeout is specified
          const timeoutSignal = timeout
            ? AbortSignal.timeout(timeout)
            : undefined;
          const combinedSignal =
            signal && timeoutSignal
              ? AbortSignal.any([signal, timeoutSignal])
              : signal || timeoutSignal;

          const result = await this.translator.translateTerms(
            category,
            combinedSignal
          );

          Object.assign(category, result.updatedCategory);

          // Accumulate usage
          if (result.usage) {
            this.totalUsage.promptTokens += result.usage.promptTokens;
            this.totalUsage.completionTokens += result.usage.completionTokens;
            this.totalUsage.totalTokens += result.usage.totalTokens;
          }
        } catch (error) {
          console.error(
            "Failed to translate terms for category:",
            category.name,
            error
          );
          // Continue with other categories even if one fails
        }
      }
    }
  }

  private renderFinalTemplate(html: string): string {
    let finalHtml = html;

    this.currentTerms.forEach((category) => {
      category.terms.forEach((term) => {
        if (term.translated && term.translated !== term.original) {
          // Simple string replacement instead of template rendering
          const regex = new RegExp(this.escapeRegExp(term.original), "g");
          finalHtml = finalHtml.replace(regex, term.translated);
        }
      });
    });

    return finalHtml;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  public restoreOriginalText(): void {
    this.originalTextMap.forEach((originalText, node) => {
      if (node.parentNode) {
        node.nodeValue = originalText;
      }
    });
  }

  private normalizeText(node: Text): string {
    return node.nodeValue?.trim() ?? "";
  }

  private acceptTextNodeFilter(node: Node): boolean {
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const parentElem = node.parentElement;
    const skippedByParentTag =
      !parentElem || PageTranslator.SKIP_TAGS.has(parentElem.tagName);
    if (skippedByParentTag) return false;

    // Skip elements that have already been translated
    if (parentElem && parentElem.hasAttribute("data-translation")) {
      return false;
    }

    const text = this.normalizeText(node as Text);
    const empty = !text.length;
    const hasWords = PageTranslator.RX_LETTER.test(text);
    return !empty && hasWords;
  }

  collectTextNodes(rootElement: HTMLElement): Text[] {
    const treeWalker = document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const accepted = this.acceptTextNodeFilter(node);
          return accepted ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      }
    );

    const textNodes: Text[] = [];
    while (treeWalker.nextNode()) {
      textNodes.push(treeWalker.currentNode as Text);
    }
    const shadowDomNodes = this.collectTextNodesShadowDOM(rootElement);
    textNodes.push(...shadowDomNodes);
    return textNodes;
  }

  private collectTextNodesShadowDOM(
    rootElem: HTMLElement | ShadowRoot
  ): Text[] {
    const shadowDomElements = Array.from(rootElem.querySelectorAll("*")).filter(
      (elem) => elem.shadowRoot
    ) as HTMLElement[];

    if (shadowDomElements.length) {
      return shadowDomElements
        .map((elem) => this.collectTextNodes(elem.shadowRoot! as any))
        .flat();
    }
    return [];
  }
}
