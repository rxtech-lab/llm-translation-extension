import type { Category, Terms, TokenUsage, Translator } from "./llm/translator";
import { RegexRenderer } from "./renderer";
import { extractDomain } from "../utils/domain";

export interface TranslationProgress {
  current: number;
  total: number;
  currentText?: string;
  translatedText?: string;
  usage?: TokenUsage;
  error?: string;
}

export interface TranslationResult {
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
  private renderer = new RegexRenderer();

  constructor(
    private translator: Translator,
    private previousTerms: Category[] = [],
    private batchSize: number = PageTranslator.DEFAULT_BATCH_SIZE,
    private onTermsUpdated?: (
      terms: Category[],
      domain?: string
    ) => Promise<void>,
    private domain?: string
  ) {
    this.currentTerms = this.previousTerms;
  }

  /**
   * Filters terms by domain from a domain-based terms object
   * @param termsByDomain - Object containing terms organized by domain
   * @param currentDomain - The domain to filter by
   * @returns Categories for the specified domain
   */
  public static filterTermsByDomain(
    termsByDomain: { [domain: string]: Category[] },
    currentDomain: string
  ): Category[] {
    const domain = extractDomain(currentDomain);
    return termsByDomain[domain] || [];
  }

  public async *translate(
    rootElement: HTMLElement,
    signal?: AbortSignal,
    timeout?: number
  ): AsyncGenerator<TranslationProgress, TranslationResult> {
    const textNodes = this.collectTextNodes(rootElement);
    const totalTexts = textNodes.map((node) => this.normalizeText(node));

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
            await this.addNewTerms(result.terms);
            // Translate new terms immediately
            await this.translateNewTerms(result.terms, combinedSignal);
          }

          // Accumulate usage
          if (result.usage) {
            this.totalUsage.promptTokens += result.usage.promptTokens;
            this.totalUsage.completionTokens += result.usage.completionTokens;
            this.totalUsage.totalTokens += result.usage.totalTokens;
          }

          // Update the text node with base translated text (without terms replacement)
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

    await this.translateAllTerms(signal, timeout);

    // Apply term replacement to all translated nodes at the end
    this.applyTermsReplacementToAllNodes(rootElement);

    return {
      terms: this.currentTerms,
      totalUsage: this.totalUsage,
    };
  }

  /**
   * Update the text node with the translated text
   * @param node - The text node to update
   * @param translatedText - The translated text
   * @param isTranslated - Whether the node is already translated. If true, the node will not be marked as translated and the original text will not be stored in data attributes
   */
  private updateTextNode(
    node: Text,
    translatedText: string,
    isTranslated: boolean = false
  ): void {
    if (node.parentNode && node.nodeValue !== translatedText) {
      const parent = node.parentNode;
      const parentElement = node.parentElement;

      // Store complete original HTML content of parent element before any modifications
      if (parentElement && !isTranslated) {
        // Store original HTML content before first modification to this element
        if (!parentElement.getAttribute("data-original-text")) {
          parentElement.setAttribute(
            "data-original-text",
            parentElement.innerHTML || ""
          );
        }
        parentElement.setAttribute("data-translation", "true");
      }

      // Check if the translated text contains HTML (spans with tooltips)
      if (translatedText.includes('<span class="translated-term"')) {
        // Create a temporary element to parse the HTML
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = translatedText;

        // Replace the text node with the HTML content
        const fragment = document.createDocumentFragment();

        // Move all child nodes from temp div to fragment
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }

        // Replace the text node with the fragment
        parent.replaceChild(fragment, node);
      } else {
        // Plain text replacement
        node.nodeValue = translatedText;
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

  private async addNewTerms(newTerms: Terms[]): Promise<void> {
    if (newTerms.length === 0) return;

    let generalCategory = this.currentTerms.find(
      (cat) => cat.name === "General"
    );
    if (!generalCategory) {
      generalCategory = { name: "General", terms: [] };
      this.currentTerms.push(generalCategory);
    }

    let hasNewTerms = false;
    newTerms.forEach((term) => {
      const exists = generalCategory!.terms.some(
        (t) => t.original === term.original
      );
      if (!exists) {
        generalCategory!.terms.push(term);
        hasNewTerms = true;
      }
    });

    // Re-process already translated nodes with new terms
    if (hasNewTerms) {
      this.updateAllTranslatedNodesWithNewTerms();
    }

    // Save terms to Chrome storage if new terms were added
    if (hasNewTerms && this.onTermsUpdated) {
      try {
        await this.onTermsUpdated(this.currentTerms, this.domain);
      } catch (error) {
        console.error("Failed to save terms to storage:", error);
      }
    }
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

  public restoreOriginalText(rootElement: HTMLElement): void {
    this.restoreOriginalTextFromDataAttributes(rootElement);
  }

  private restoreOriginalTextFromDataAttributes(element: HTMLElement): void {
    const translatedElements = element.querySelectorAll(
      '[data-translation="true"]'
    );
    translatedElements.forEach((element) => {
      const originalHTML = element.getAttribute("data-original-text");
      if (originalHTML) {
        // Replace the element's content with the original HTML
        element.innerHTML = originalHTML;

        // Update data-translation attribute to false instead of removing it
        element.setAttribute("data-translation", "false");
        // Keep the original HTML attribute for potential future use
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

    // Skip elements that have already been translated (but allow elements with data-translation="false")
    if (parentElem && parentElem.getAttribute("data-translation") === "true") {
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
      return shadowDomElements.flatMap((elem) =>
        elem.shadowRoot
          ? this.collectTextNodes(elem.shadowRoot as unknown as HTMLElement)
          : []
      );
    }
    return [];
  }

  private applyTermsReplacement(text: string): string {
    // Step 1: Convert text to template by replacing terms with template variables
    const template = text;
    const context: { [key: string]: string } = {};

    this.currentTerms.forEach((category) => {
      category.terms.forEach((term) => {
        if (term.translated && term.translated !== term.original) {
          context[term.template.replaceAll("{{", "").replaceAll("}}", "")] =
            term.translated;
        }
      });
    });

    try {
      // Step 2: Render the template with RegexRenderer
      return this.renderer.render(template, context);
    } catch (error) {
      console.error("Failed to render template:", error);
      console.error("Failed to render template:", text, context);
      // Fallback to original text if rendering fails
      return text;
    }
  }

  private applyTermsReplacementToAllNodes(element: HTMLElement): void {
    // Apply term replacement to all translated nodes at once using data attributes
    const translatedElements = element.querySelectorAll(
      '[data-translation="true"]'
    );

    translatedElements.forEach((element) => {
      const textNode = this.findTextNodeInElement(element);
      if (textNode) {
        const updatedText = this.applyTermsReplacement(
          textNode.nodeValue || ""
        );
        this.updateTextNode(textNode, updatedText, true);
      }
    });
  }

  /**
   * Finds the first text node within an element that exists in the translatedNodes map
   * @param element - The element to search within
   * @returns The text node if found, null otherwise
   */
  private findTextNodeInElement(element: Element): Text | null {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: () => {
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNode = walker.nextNode() as Text;
    return textNode || null;
  }

  private updateAllTranslatedNodesWithNewTerms(): void {
    // This method is now an alias for applyTermsReplacementToAllNodes
    this.applyTermsReplacementToAllNodes(document.body);
  }

  private async translateNewTerms(
    newTerms: Terms[],
    signal?: AbortSignal
  ): Promise<void> {
    if (newTerms.length === 0) return;

    // Find the General category where new terms were added
    const generalCategory = this.currentTerms.find(
      (cat) => cat.name === "General"
    );
    if (!generalCategory) return;

    // Get the specific terms that need translation
    const termsToTranslate = generalCategory.terms.filter(
      (term) =>
        newTerms.some((newTerm) => newTerm.original === term.original) &&
        !term.translated
    );

    if (termsToTranslate.length === 0) return;

    try {
      const result = await this.translator.translateTerms(
        generalCategory,
        signal
      );

      // Update the category with translations
      Object.assign(generalCategory, result.updatedCategory);

      // Accumulate usage
      if (result.usage) {
        this.totalUsage.promptTokens += result.usage.promptTokens;
        this.totalUsage.completionTokens += result.usage.completionTokens;
        this.totalUsage.totalTokens += result.usage.totalTokens;
      }

      // Update all translated nodes with the new term translations
      this.updateAllTranslatedNodesWithNewTerms();
    } catch (error) {
      console.error("Failed to translate new terms:", error);
    }
  }
}
