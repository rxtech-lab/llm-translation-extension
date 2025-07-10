import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  Category,
  Terms as TermsType,
} from "../../../translator/llm/translator";

export interface TermsPageState {
  categories: Category[];
  searchQuery: string;
  selectedCategory: string;
  selectedDomain: string;
  domains: string[];
  editingTerm: TermsType | null;
  originalEditingTerm: (TermsType & { categoryName: string }) | null;
  newTerm: Partial<TermsType>;
  loading: boolean;
  isDialogOpen: boolean;
  newDomainForTerm: string;
  isClearAllDialogOpen: boolean;
}

const initialState: TermsPageState = {
  categories: [],
  searchQuery: "",
  selectedCategory: "all",
  selectedDomain: "all",
  domains: [],
  editingTerm: null,
  originalEditingTerm: null,
  newTerm: { original: "", translated: "", description: "", template: "" },
  loading: true,
  isDialogOpen: false,
  newDomainForTerm: "",
  isClearAllDialogOpen: false,
};

export function useTerms() {
  const [state, setState] = useState<TermsPageState>(initialState);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const loadDomainsAndTerms = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getDomains",
      });

      if (response.success) {
        const domains = response.domains || [];
        setState((prev) => ({ ...prev, domains }));

        if (domains.length > 0) {
          await loadAllTerms(domains);
        }
      }
    } catch (error) {
      console.error("Failed to load domains:", error);
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const loadAllTerms = useCallback(async (domains: string[]) => {
    try {
      const allCategories: Category[] = [];

      for (const domain of domains) {
        const response = await chrome.runtime.sendMessage({
          action: "getTerms",
          domain,
        });

        if (response.success && response.terms) {
          const domainCategories = response.terms.map((cat: Category) => ({
            ...cat,
            name: cat.name.startsWith(`${domain} - `)
              ? cat.name
              : `${domain} - ${cat.name}`,
          }));
          allCategories.push(...domainCategories);
        }
      }

      setState((prev) => ({ ...prev, categories: allCategories }));
    } catch (error) {
      console.error("Failed to load all terms:", error);
    }
  }, []);

  const loadTermsForDomain = useCallback(async (domain: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getTerms",
        domain,
      });

      if (response.success) {
        setState((prev) => ({ ...prev, categories: response.terms || [] }));
      }
    } catch (error) {
      console.error("Failed to load terms for domain:", error);
    }
  }, []);

  const saveTerms = useCallback(
    async (categories?: Category[]) => {
      const categoriesToSave = categories || state.categories;
      const domain =
        state.selectedDomain === "all" ? "general" : state.selectedDomain;

      try {
        await chrome.runtime.sendMessage({
          action: "saveTerms",
          terms: categoriesToSave,
          domain,
        });
      } catch (error) {
        console.error("Failed to save terms:", error);
      }
    },
    [state.categories, state.selectedDomain]
  );

  const saveTermsForDomain = useCallback(
    async (categories: Category[], domain: string) => {
      try {
        await chrome.runtime.sendMessage({
          action: "saveTerms",
          terms: categories,
          domain,
        });

        if (!state.domains.includes(domain)) {
          setState((prev) => ({
            ...prev,
            domains: [...prev.domains, domain],
          }));
        }
      } catch (error) {
        console.error("Failed to save terms for domain:", error);
      }
    },
    [state.domains]
  );

  const addNewTerm = useCallback(async () => {
    if (!state.newTerm.original || !state.newTerm.translated) return;
    if (!state.newDomainForTerm) {
      toast.error("Please select a domain to add terms");
      return;
    }

    const categoryName =
      state.selectedCategory === "all" ? "General" : state.selectedCategory;

    try {
      const response = await chrome.runtime.sendMessage({
        action: "getTerms",
        domain: state.newDomainForTerm,
      });

      let targetCategories: Category[] = [];
      if (response.success && response.terms) {
        targetCategories = [...response.terms];
      }

      let category = targetCategories.find((cat) => cat.name === categoryName);
      if (!category) {
        category = { name: categoryName, terms: [] };
        targetCategories.push(category);
      }

      category.terms.push({
        original: state.newTerm.original,
        translated: state.newTerm.translated,
        description: state.newTerm.description || "",
        template: state.newTerm.template || "",
      });

      await saveTermsForDomain(targetCategories, state.newDomainForTerm);

      setState((prev) => ({
        ...prev,
        newTerm: { original: "", translated: "", description: "" },
        newDomainForTerm: "",
      }));

      if (
        state.selectedDomain === state.newDomainForTerm ||
        state.selectedDomain === "all"
      ) {
        if (state.selectedDomain === "all") {
          const updatedDomains = state.domains.includes(state.newDomainForTerm)
            ? state.domains
            : [...state.domains, state.newDomainForTerm];
          await loadAllTerms(updatedDomains);
        } else {
          setState((prev) => ({
            ...prev,
            categories: targetCategories,
          }));
        }
      }

      toast.success(
        `Term "${state.newTerm.original}" successfully added to domain "${state.newDomainForTerm}"`
      );
    } catch (error) {
      console.error("Failed to add new term:", error);
      toast.error("Failed to add new term. Please try again.");
    }
  }, [
    state.newTerm,
    state.newDomainForTerm,
    state.selectedCategory,
    state.selectedDomain,
    state.domains,
    saveTermsForDomain,
    loadAllTerms,
  ]);

  const editTerm = useCallback((term: TermsType & { categoryName: string }) => {
    setState((prev) => ({
      ...prev,
      editingTerm: { ...term },
      originalEditingTerm: { ...term },
      isDialogOpen: true,
    }));
  }, []);

  const updateTerm = useCallback(async () => {
    if (!state.editingTerm || !state.originalEditingTerm) return;

    if (state.selectedDomain === "all") {
      const domainMatch =
        state.originalEditingTerm.categoryName.match(/^(.+?) - (.+)$/);
      if (domainMatch) {
        const [, domain, originalCategoryName] = domainMatch;

        const response = await chrome.runtime.sendMessage({
          action: "getTerms",
          domain,
        });

        if (response.success && response.terms) {
          const updatedCategories = response.terms.map((cat: Category) => {
            if (cat.name === originalCategoryName) {
              return {
                ...cat,
                terms: cat.terms.map((term: TermsType) =>
                  term.original === state.originalEditingTerm?.original
                    ? ({
                        original: state.editingTerm?.original,
                        translated: state.editingTerm?.translated,
                        description: state.editingTerm?.description,
                        template: state.editingTerm?.template,
                      } as TermsType)
                    : term
                ),
              };
            }
            return cat;
          });

          await chrome.runtime.sendMessage({
            action: "saveTerms",
            terms: updatedCategories,
            domain,
          });

          await loadAllTerms(state.domains);
        }
      }
    } else {
      setState((prev) => {
        const categories = prev.categories.map((cat) => {
          if (cat.name === prev.originalEditingTerm?.categoryName) {
            return {
              ...cat,
              terms: cat.terms.map((term) =>
                term.original === prev.originalEditingTerm?.original
                  ? ({
                      original: state.editingTerm?.original,
                      translated: state.editingTerm?.translated,
                      description: state.editingTerm?.description,
                      template: state.editingTerm?.template,
                    } as TermsType)
                  : term
              ),
            };
          }
          return cat;
        });

        saveTerms(categories);

        return {
          ...prev,
          categories,
          editingTerm: null,
          originalEditingTerm: null,
          isDialogOpen: false,
        };
      });
    }

    setState((prev) => ({
      ...prev,
      editingTerm: null,
      originalEditingTerm: null,
      isDialogOpen: false,
    }));
  }, [
    state.editingTerm,
    state.originalEditingTerm,
    state.selectedDomain,
    state.domains,
    loadAllTerms,
    saveTerms,
  ]);

  const cancelEdit = useCallback(() => {
    setState((prev) => ({
      ...prev,
      editingTerm: null,
      originalEditingTerm: null,
      isDialogOpen: false,
    }));
  }, []);

  const deleteTerm = useCallback(
    async (termToDelete: TermsType & { categoryName: string }) => {
      try {
        if (state.selectedDomain === "all") {
          const domainMatch = termToDelete.categoryName.match(/^(.+?) - (.+)$/);
          if (domainMatch) {
            const [, domain, originalCategoryName] = domainMatch;

            const response = await chrome.runtime.sendMessage({
              action: "getTerms",
              domain,
            });

            if (response.success && response.terms) {
              const updatedCategories = response.terms
                .map((cat: Category) => {
                  if (cat.name === originalCategoryName) {
                    return {
                      ...cat,
                      terms: cat.terms.filter(
                        (term: TermsType) =>
                          term.original !== termToDelete.original
                      ),
                    };
                  }
                  return cat;
                })
                .filter((cat: Category) => cat.terms.length > 0);

              await chrome.runtime.sendMessage({
                action: "saveTerms",
                terms: updatedCategories,
                domain,
              });

              await loadAllTerms(state.domains);
              toast.success(
                `Term "${termToDelete.original}" deleted successfully`
              );
            } else {
              toast.error("Failed to delete term. Please try again.");
            }
          }
        } else {
          setState((prev) => {
            const categories = prev.categories
              .map((cat) => {
                if (cat.name === termToDelete.categoryName) {
                  return {
                    ...cat,
                    terms: cat.terms.filter(
                      (term) => term.original !== termToDelete.original
                    ),
                  };
                }
                return cat;
              })
              .filter((cat) => cat.terms.length > 0);

            saveTerms(categories);

            return { ...prev, categories };
          });

          toast.success(`Term "${termToDelete.original}" deleted successfully`);
        }
      } catch (error) {
        console.error("Failed to delete term:", error);
        toast.error("Failed to delete term. Please try again.");
      }
    },
    [state.selectedDomain, state.domains, loadAllTerms, saveTerms]
  );

  const clearAllTerms = useCallback(async () => {
    try {
      if (state.selectedDomain === "all") {
        for (const domain of state.domains) {
          await chrome.runtime.sendMessage({
            action: "saveTerms",
            terms: [],
            domain,
          });
        }

        await loadAllTerms(state.domains);
        toast.success("All terms cleared for all domains");
      } else {
        await chrome.runtime.sendMessage({
          action: "saveTerms",
          terms: [],
          domain: state.selectedDomain,
        });

        await loadTermsForDomain(state.selectedDomain);
        toast.success(`All terms cleared for domain "${state.selectedDomain}"`);
      }

      setState((prev) => ({
        ...prev,
        isClearAllDialogOpen: false,
      }));
    } catch (error) {
      console.error("Failed to clear all terms:", error);
      toast.error("Failed to clear all terms. Please try again.");
    }
  }, [state.selectedDomain, state.domains, loadAllTerms, loadTermsForDomain]);

  const openClearAllDialog = useCallback(() => {
    setState((prev) => ({ ...prev, isClearAllDialogOpen: true }));
  }, []);

  const closeClearAllDialog = useCallback(() => {
    setState((prev) => ({ ...prev, isClearAllDialogOpen: false }));
  }, []);

  const filteredTerms = useMemo(() => {
    const allTerms = state.categories.flatMap((cat) =>
      cat.terms.map((term) => ({ ...term, categoryName: cat.name }))
    );

    let filtered = allTerms;

    if (state.selectedCategory !== "all") {
      filtered = filtered.filter(
        (term) => term.categoryName === state.selectedCategory
      );
    }

    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (term) =>
          term.original.toLowerCase().includes(query) ||
          term.translated.toLowerCase().includes(query) ||
          term.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [state.categories, state.searchQuery, state.selectedCategory]);

  const categoryOptions = useMemo(() => {
    const categories = state.categories.map((cat) => cat.name);
    return ["all", ...categories];
  }, [state.categories]);

  const updateState = useCallback(
    (updater: (prev: TermsPageState) => TermsPageState) => {
      setState(updater);
    },
    []
  );

  useEffect(() => {
    loadDomainsAndTerms();
  }, [loadDomainsAndTerms]);

  useEffect(() => {
    if (state.selectedDomain && state.selectedDomain !== "all") {
      loadTermsForDomain(state.selectedDomain);
    } else if (state.selectedDomain === "all") {
      loadAllTerms(state.domains);
    }
  }, [state.selectedDomain, loadTermsForDomain, loadAllTerms, state.domains]);

  useEffect(() => {
    const handleMessage = (message: { action: string; domain: string }) => {
      if (message.action === "termsUpdated") {
        if (state.selectedDomain === "all") {
          loadAllTerms(state.domains);
        } else if (state.selectedDomain === message.domain) {
          loadTermsForDomain(message.domain);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [state.selectedDomain, state.domains, loadAllTerms, loadTermsForDomain]);

  return {
    state,
    updateState,
    actions: {
      loadDomainsAndTerms,
      loadAllTerms,
      loadTermsForDomain,
      saveTerms,
      saveTermsForDomain,
      addNewTerm,
      editTerm,
      updateTerm,
      cancelEdit,
      deleteTerm,
      clearAllTerms,
      openClearAllDialog,
      closeClearAllDialog,
    },
    computed: {
      filteredTerms,
      categoryOptions,
    },
  };
}
