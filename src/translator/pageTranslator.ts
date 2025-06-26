export class PageTranslator {
  static readonly SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "CODE",
    "PRE",
  ]);
  static readonly RX_LETTER = /\p{L}/u;

  public translate(rootElement: HTMLElement) {}

  private normalizeText(node: Text): string {
    return node.nodeValue?.trim() ?? "";
  }

  private acceptTextNodeFilter(node: Node): boolean {
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const parentElem = node.parentElement;
    const skippedByParentTag =
      !parentElem || PageTranslator.SKIP_TAGS.has(parentElem.tagName);
    if (skippedByParentTag) return false;

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
