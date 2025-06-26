# Chrome page translation extension

This is a Chrome extension that allows you to translate webpage using `vercel ai sdk` api.

The webpage simply uses `pageTranslator` to grab the text from the page and translate it using the `vercel ai sdk` api.

## Tech stacks
- TypeScript
- React
- Tailwind CSS
- @tanstack/react-virtual
- @vercel/ai
- Nunjucks
- Vite
- Chrome Extension API
- Vitest

This extension contains tree pages:

1. Settings page: where user can define the language to translate to, the api key, the openai model url and the model id.
2. Terms page where some special terms are defined here, this page is rendered using `@tanstack/react-virtial` to handle large lists of terms efficiently and also a search bar to filter terms.
```typescript
interface Terms {
    /// The original text of the term
    originalText: string;
    /// The translated text of the term
    translatedText: string;
    /// The description of the term
    description: string;
}

interface Category {
    /// The name of the category
    name: string;
    /// The terms in the category
    terms: Terms[];
}
```
3. Translation page where the user can translate the current page using the `pageTranslator` function. The translation happened in the background thread and will also output the progress of the translation (using current translated text nodes/ total text nodes) 
   and the translated text will be displayed in a popup. User can also stop the translation process at any time.

## Translation process

1. `pageTranslator` is called to grab text nodes from the page
2. `pageTranslator` takes a llm translator object `src/translator/llm/translator.ts` to translate the text nodes
3. During the translation, the llm model will replace the terms into `{{term}}` jinja format, and the terms will be stored in the `terms` array.
4. At the end, llm will translate the terms as well
5. And finally, the final result will be rendered using `https://mozilla.github.io/nunjucks/` to replace the `{{term}}` with the translated terms.
6. All translation happened in the service worker and should send event to the frontend to update the progress and the translated text.
7. Whenever the terms are updated, the terms will be saved to the `chrome.storage.local` and can be accessed from the terms page. It will also notify the translation page to update the translation.
8. During the translation, display the total cost as well using the usage object from `ai` sdk.