import { openai } from '@ai-sdk/openai';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { Translator, TranslateProps, TranslateResult, Category, Terms } from './translator';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

const TranslateTextSchema = z.object({
  translatedText: z.string(),
  newTerms: z.array(z.object({
    original: z.string(),
    translated: z.string(),
    description: z.string()
  }))
});

const TranslateTermsSchema = z.object({
  terms: z.array(z.object({
    original: z.string(),
    translated: z.string(),
    description: z.string()
  }))
});

export class OpenAILLMTranslator implements Translator {
  constructor(private config: OpenAIConfig, private targetLanguage: string) {}

  async translateText(props: TranslateProps): Promise<TranslateResult> {
    const { currentText, siblingText, totalText, terms } = props;
    
    const termsContext = terms.map(category => 
      `Category: ${category.name}\n${category.terms.map(term => 
        `${term.original} -> {{${term.original}}} (${term.description})`
      ).join('\n')}`
    ).join('\n\n');

    const prompt = `You are a professional translator. Translate the following text to ${this.targetLanguage}.

Context from the page:
${totalText.slice(0, 5).join('\n')}
${totalText.length > 5 ? '...' : ''}

Sibling texts (nearby elements):
${siblingText.join('\n')}

Current text to translate:
"${currentText}"

Existing terms dictionary:
${termsContext}

Instructions:
1. Translate the current text naturally and contextually
2. If you encounter specialized terms that should be consistent across the document, replace them with {{term}} format
3. Return any new terms that should be added to the dictionary
4. Maintain the original formatting and structure`;

    try {
      const result = await generateObject({
        model: openai(this.config.model, {
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
        }),
        prompt,
        schema: TranslateTextSchema,
        temperature: 0.3,
      });

      return {
        translatedText: result.object.translatedText,
        terms: result.object.newTerms
      };
    } catch (error) {
      console.error('Translation error:', error);
      return {
        translatedText: currentText,
        terms: []
      };
    }
  }

  async translateTerms(category: Category): Promise<Category> {
    const termsToTranslate = category.terms.filter(term => !term.translated);
    
    if (termsToTranslate.length === 0) {
      return category;
    }

    const prompt = `Translate the following terms to ${this.targetLanguage}. These are specialized terms from category "${category.name}".

Terms to translate:
${termsToTranslate.map(term => `${term.original} (${term.description})`).join('\n')}

Please provide translations that are:
1. Contextually appropriate for the category
2. Consistent with professional terminology
3. Preserve the meaning and nuance`;

    try {
      const result = await generateObject({
        model: openai(this.config.model, {
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
        }),
        prompt,
        schema: TranslateTermsSchema,
        temperature: 0.2,
      });

      const translations = new Map<string, string>();
      result.object.terms.forEach(term => {
        translations.set(term.original, term.translated);
      });

      const updatedTerms = category.terms.map(term => ({
        ...term,
        translated: translations.get(term.original) || term.translated
      }));

      return {
        ...category,
        terms: updatedTerms
      };
    } catch (error) {
      console.error('Terms translation error:', error);
      return category;
    }
  }
}