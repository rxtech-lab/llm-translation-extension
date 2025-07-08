import nunjucks from 'nunjucks';
import type { Category, Terms } from './llm/translator';

export interface TermsRendererOptions {
  dataAttribute?: string;
  templateEngine?: nunjucks.Environment;
}

export class TermsRenderer {
  private env: nunjucks.Environment;
  private dataAttribute: string;
  private termsDict: Record<string, string> = {};

  constructor(options: TermsRendererOptions = {}) {
    this.dataAttribute = options.dataAttribute || 'data-translation';
    
    // Configure Nunjucks environment without FileSystemLoader
    this.env = options.templateEngine || new nunjucks.Environment(undefined, {
      autoescape: true,
      throwOnUndefined: false,
    });
    
    // Add custom filters for terms
    this.env.addFilter('translate', (text: string) => {
      return this.termsDict[text] || text;
    });
  }

  /**
   * Load terms from Chrome storage and update dictionary
   */
  public async loadTermsFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['translationTerms']);
      if (result.translationTerms) {
        this.updateTermsDictionary(result.translationTerms);
      }
    } catch (error) {
      console.error('Failed to load terms from storage:', error);
    }
  }

  /**
   * Update the terms dictionary from categories
   */
  public updateTermsDictionary(categories: Category[]): void {
    this.termsDict = {};
    
    categories.forEach(category => {
      category.terms.forEach(term => {
        if (term.translated && term.translated !== term.original) {
          this.termsDict[term.original] = term.translated;
        }
      });
    });
  }

  /**
   * Grab all translated elements (identified by data attribute)
   */
  public getTranslatedElements(rootElement: HTMLElement = document.body): HTMLElement[] {
    const elements = Array.from(rootElement.querySelectorAll(`[${this.dataAttribute}]`));
    return elements as HTMLElement[];
  }

  /**
   * Render text content with terms dictionary using Nunjucks
   */
  public renderText(text: string, additionalContext: Record<string, any> = {}): string {
    const context = {
      ...additionalContext,
      terms: this.termsDict,
    };

    try {
      return this.env.renderString(text, context);
    } catch (error) {
      console.error('Failed to render text with Nunjucks:', error);
      return text; // Return original text if rendering fails
    }
  }

  /**
   * Process all translated elements and update their text nodes
   */
  public processTranslatedElements(
    rootElement: HTMLElement = document.body,
    additionalContext: Record<string, any> = {}
  ): void {
    const translatedElements = this.getTranslatedElements(rootElement);
    
    translatedElements.forEach(element => {
      this.updateElementTextNodes(element, additionalContext);
    });
  }

  /**
   * Update text nodes within an element using terms dictionary
   */
  private updateElementTextNodes(
    element: HTMLElement,
    additionalContext: Record<string, any> = {}
  ): void {
    const textNodes = this.getTextNodes(element);
    
    textNodes.forEach(node => {
      if (node.nodeValue) {
        const originalText = node.nodeValue.trim();
        if (originalText) {
          const renderedText = this.renderText(originalText, additionalContext);
          if (renderedText !== originalText) {
            node.nodeValue = renderedText;
          }
        }
      }
    });
  }

  /**
   * Get all text nodes within an element
   */
  private getTextNodes(element: HTMLElement): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const textNode = node as Text;
          const text = textNode.nodeValue?.trim() || '';
          return text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      }
    );

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    return textNodes;
  }

  /**
   * Apply terms to specific text with template rendering
   */
  public applyTermsToText(
    text: string,
    terms: Terms[],
    additionalContext: Record<string, any> = {}
  ): string {
    // Create a temporary terms dictionary for this operation
    const tempDict: Record<string, string> = {};
    terms.forEach(term => {
      if (term.translated && term.translated !== term.original) {
        tempDict[term.original] = term.translated;
      }
    });

    const context = {
      ...additionalContext,
      terms: tempDict,
    };

    try {
      return this.env.renderString(text, context);
    } catch (error) {
      console.error('Failed to apply terms to text:', error);
      return text;
    }
  }

  /**
   * Handle terms updated event - refresh all translated elements
   */
  public handleTermsUpdated(categories: Category[]): void {
    this.updateTermsDictionary(categories);
    this.processTranslatedElements();
  }

  /**
   * Create a template-aware replacement for simple text substitution
   */
  public createTemplateAwareReplacer(templateString: string): (context: Record<string, any>) => string {
    return (context: Record<string, any>) => {
      const fullContext = {
        ...context,
        terms: this.termsDict,
      };
      
      try {
        return this.env.renderString(templateString, fullContext);
      } catch (error) {
        console.error('Template rendering failed:', error);
        return templateString;
      }
    };
  }
}

// Export a default instance
export const defaultTermsRenderer = new TermsRenderer();