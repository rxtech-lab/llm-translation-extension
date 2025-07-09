# Coding guidelines

1. Use pnpm
2. Use vitest for testing
3. Use vercel ai sdk for AI interaction
4. Use `shadcn` for components
5. This is a chrome extension with react
6. Always Use nunjucks to render the translation.
7. Use framer-motion for animation

# Translation and replacement

When making translation, llm will translate terms using jinja2 syntax {{some_term}}, and render it using nunjucks to render these texts. Elements that are translated are marked with data-attribute: data-translation=true. You can use this to get all elements that been translated. The original text is also stored in the data attribute so that when restore the content, we can use that text to replace back.

All states are stored in the background script and whenever the popup page is showing, it should fetch the state from the background script.

Terms are store on domain basis such that no overwhelming terms showing when opening the terms page. User can browse the terms by domain name. Treat all subdomains equally. When making translation both the context that passed to the llm and during the string replacement, only use terms belong to that domain.
