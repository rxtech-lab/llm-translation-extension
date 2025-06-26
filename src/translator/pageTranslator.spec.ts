import { PageTranslator } from "./pageTranslator";
import { describe, expect, it } from "vitest";

describe("PageTranslator", () => {
	it("should collect text nodes", () => {
		const translator = new PageTranslator();
		const textNodes = translator.collectTextNodes(document.body);
		expect(textNodes.length).toBe(0);
	});

	it("should be able to collect multiple text nodes", () => {
		const element = document.createElement("div");
		element.innerHTML = "<p>Text 1</p><p>Text 2</p>";
		const translator = new PageTranslator();
		const textNodes = translator.collectTextNodes(element);
		expect(textNodes.length).toBe(2);
		expect(textNodes[0].textContent).toBe("Text 1");
		expect(textNodes[1].textContent).toBe("Text 2");
	});

	it("should be able to collect multiple text nodes", () => {
		const element = document.createElement("div");
		element.innerHTML = "Text 1<p>Text 2</p>";
		const translator = new PageTranslator();
		const textNodes = translator.collectTextNodes(element);
		expect(textNodes.length).toBe(2);
		expect(textNodes[0].textContent).toBe("Text 1");
		expect(textNodes[1].textContent).toBe("Text 2");
	});
});
