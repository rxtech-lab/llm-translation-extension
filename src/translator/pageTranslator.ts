import type { Category, Terms, TokenUsage, Translator } from "./llm/translator";
import * as nunjucks from "nunjucks";
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
  private translatedNodes = new Map<Text, string>();

  constructor(
    private translator: Translator,
    private previousTerms: Category[] = [],
    private batchSize: number = PageTranslator.DEFAULT_BATCH_SIZE,
    private onTermsUpdated?: (terms: Category[], domain?: string) => Promise<void>,
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
    // Restore any previous translations before starting a new one using data attributes
    this.restoreOriginalTextFromDataAttributes();
    
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

          // Store the base translated text without terms replacement
          this.translatedNodes.set(node, result.translatedText);

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
    this.applyTermsReplacementToAllNodes();

    const finalHtml = this.renderFinalTemplate(rootElement.outerHTML);

    return {
      finalHtml,
      terms: this.currentTerms,
      totalUsage: this.totalUsage,
    };
  }

  private updateTextNode(node: Text, translatedText: string): void {
    if (node.parentNode && node.nodeValue !== translatedText) {
      const parent = node.parentNode;
      const parentElement = node.parentElement;

      // Store original text in data attribute before replacing
      const originalText = this.originalTextMap.get(node) || node.nodeValue || "";
      
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

      // Mark parent element as translated and store original text
      if (parentElement) {
        parentElement.setAttribute("data-translation", "true");
        parentElement.setAttribute("data-original-text", originalText);
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

  private renderFinalTemplate(html: string): string {
    // Terms have already been applied to all translated nodes
    // Just return the HTML as-is since DOM nodes are already updated
    return html;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private escapeHtml(string: string): string {
    return string
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  public restoreOriginalText(): void {
    // Method 1: Restore using originalTextMap (for text nodes still in DOM)
    this.originalTextMap.forEach((originalText, node) => {
      if (node.parentNode && node.parentElement) {
        node.nodeValue = originalText;
        // Update data-translation attribute to false
        node.parentElement.setAttribute('data-translation', 'false');
      }
    });

    // Method 2: Restore using data attributes (for elements that may have been replaced)
    this.restoreOriginalTextFromDataAttributes();
  }

  private restoreOriginalTextFromDataAttributes(): void {
    const translatedElements = document.querySelectorAll('[data-translation="true"]');
    translatedElements.forEach((element) => {
      const originalText = element.getAttribute('data-original-text');
      if (originalText) {
        // Replace the element's content with the original text
        element.textContent = originalText;
        
        // Update data-translation attribute to false instead of removing it
        element.setAttribute('data-translation', 'false');
        // Keep the original text attribute for potential future use
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
      return shadowDomElements
        .flatMap((elem) => elem.shadowRoot ? this.collectTextNodes(elem.shadowRoot as unknown as HTMLElement) : []);
    }
    return [];
  }

  private applyTermsReplacement(text: string): string {
    try {
      // Step 1: Convert text to nunjucks template by replacing terms with template variables
      const template = text;
      const context: { [key: string]: string } = {};

      this.currentTerms.forEach((category) => {
        category.terms.forEach((term) => {
          if (term.translated && term.translated !== term.original) {
            context[term.template] = term.translated;
          }
        });
      });

      // Step 2: Render the template with nunjucks
      const env = new nunjucks.Environment();
      return env.renderString(template, context);
    } catch (error) {
      console.error("Failed to render template:", error);
      // Fallback to original text if nunjucks fails
      return text;
    }
  }

  private applyTermsReplacementToAllNodes(): void {
    // Apply term replacement to all translated nodes at once
    const entries = Array.from(this.translatedNodes.entries());

    entries.forEach(([node, baseTranslatedText]) => {
      // Check if the node is still in the document (it might have been replaced)
      if (node.parentNode) {
        const updatedText = this.applyTermsReplacement(baseTranslatedText);
        this.updateTextNode(node, updatedText);
      }
    });
  }

  private updateAllTranslatedNodesWithNewTerms(): void {
    // This method is now an alias for applyTermsReplacementToAllNodes
    this.applyTermsReplacementToAllNodes();
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
