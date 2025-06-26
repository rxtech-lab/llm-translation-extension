export interface Terms {
	original: string;
	translated: string;
	description: string;
}

export interface Category {
	name: string;
	terms: Terms[];
}

export interface TranslateProps {
	currentText: string;
	// Texts that are siblings of the current text node
	siblingText: string[];
	totalText: string[];
	terms: Category[];
}

export interface TranslateResult {
	translatedText: string;
	// New terms that need to be added to the dictionary
	terms: Terms[];
}

export interface Translator {
	/// Translate a single text node by using its sibling texts, current text, and the total text in the document.
	translateText(props: TranslateProps): Promise<TranslateResult>;
	/// Translate a category of terms, which may include multiple terms that need to be translated.
	translateTerms(category: Category): Promise<Category>;
}
