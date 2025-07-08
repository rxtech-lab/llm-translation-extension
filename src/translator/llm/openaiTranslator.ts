import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, Output, type LanguageModelV1 } from "ai";
import { z } from "zod";
import type {
  Category,
  TranslateProps,
  TranslateResult,
  Translator,
  TokenUsage,
} from "./translator";

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

const TranslateTextSchema = z.object({
  translatedText: z.string(),
  newTerms: z.array(
    z.object({
      original: z.string(),
      translated: z.string(),
      description: z.string(),
    })
  ),
});

const TranslateTermsSchema = z.object({
  terms: z.array(
    z.object({
      original: z.string(),
      translated: z.string(),
      description: z.string(),
    })
  ),
});

export class OpenAILLMTranslator implements Translator {
  model: LanguageModelV1;
  constructor(private config: OpenAIConfig, private targetLanguage: string) {
    const openai = createOpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
    this.model = openai(this.config.model);
  }

  async translateText(props: TranslateProps): Promise<TranslateResult> {
    const { currentText, siblingText, totalText, terms, signal } = props;

    const termsContext = terms
      .map(
        (category) =>
          `Category: ${category.name}
${category.terms
  .map(
    (term) =>
      `${term.original} -> ${
        term.translated ? term.translated : `{{${term.original}}}`
      } (${term.description})`
  )
  .join("\n")}`
      )
      .join("\n\n");

    const prompt = `You are a professional translator. Your task is to translate the given text into ${
      this.targetLanguage
    }.

Context from the page:
${totalText.slice(0, 5).join("\n")}
${totalText.length > 5 ? "..." : ""}

Sibling texts (nearby elements):
${siblingText.join("\n")}

Current text to translate:
"${currentText}"

Existing terms dictionary:
${termsContext}

Instructions:
1.  Translate the "Current text to translate" to ${this.targetLanguage}.
2.  You MUST use the translations provided in the "Existing terms dictionary". For example, if the dictionary has "user -> user_term", you must replace "user" with "user_term".
3.  If you identify any new, specialized terms in the "Current text to translate" that are not in the dictionary, add them to the \`newTerms\` array with their translation and a brief description.
4.  Maintain the original formatting and structure.
5.  Return ONLY the translated text in \`translatedText\`, without any extra explanations or quotes.
6.  Once you faced a new term, replace it with {{term_name}} using the jinja2 syntax and put the term in the newTerms array. This term_name can be anything that describe the term. Use existing terms if you think it's relevant.
7.  Special terms could be: person, company, product, service, etc. Please replace them all with {{term_name}}.
`;

    const result = await generateText({
      model: this.model,
      prompt,
      experimental_output: Output.object({
        schema: TranslateTextSchema,
      }),
      abortSignal: signal,
    });

    return {
      translatedText: result.experimental_output.translatedText,
      terms: result.experimental_output.newTerms,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
    };
  }

  async translateTerms(
    category: Category,
    signal?: AbortSignal
  ): Promise<{ updatedCategory: Category; usage: TokenUsage }> {
    const termsToTranslate = category.terms.filter((term) => !term.translated);

    if (termsToTranslate.length === 0) {
      return {
        updatedCategory: category,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    const prompt = `Translate the following terms to ${
      this.targetLanguage
    }. These are specialized terms from category "${category.name}".

Terms to translate:
${termsToTranslate
  .map((term) => `${term.original} (${term.description})`)
  .join("\n")}

Please provide translations that are:
1. Contextually appropriate for the category
2. Consistent with professional terminology
3. Preserve the meaning and nuance`;

    const result = await generateObject({
      model: this.model,
      prompt,
      schema: TranslateTermsSchema,
      temperature: 0.2,
      abortSignal: signal,
    });

    const translations = new Map<string, string>();
    result.object.terms.forEach((term) => {
      translations.set(term.original, term.translated);
    });

    const updatedTerms = category.terms.map((term) => ({
      ...term,
      translated: translations.get(term.original) || term.translated,
    }));

    return {
      updatedCategory: {
        ...category,
        terms: updatedTerms,
      },
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}
