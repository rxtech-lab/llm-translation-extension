import "@pages/content/style.css";
import { Badge } from "@src/components/ui/badge";
import { Button } from "@src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@src/components/ui/dialog";
import { Input } from "@src/components/ui/input";
import { Label } from "@src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@src/components/ui/select";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Plus, Trash2, ChevronsUpDown } from "lucide-react";
import React, { useEffect, useId, useMemo, useState } from "react";
import { Combobox, ComboboxInput } from "@headlessui/react";
import { Category, Terms as TermsType } from "../../translator/llm/translator";
import { toast, Toaster } from "sonner";

interface TermsPageState {
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

export default function Terms() {
  const [state, setState] = useState<TermsPageState>(initialState);
  const parentRef = React.useRef<HTMLDivElement>(null);
  const originalId = useId();
  const translatedId = useId();
  const descriptionId = useId();

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    loadDomainsAndTerms();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (state.selectedDomain && state.selectedDomain !== "all") {
      loadTermsForDomain(state.selectedDomain);
    }
  }, [state.selectedDomain]);

  const loadDomainsAndTerms = async () => {
    try {
      // Load all domains
      const response = await chrome.runtime.sendMessage({
        action: "getDomains",
      });

      if (response.success) {
        const domains = response.domains || [];
        setState((prev) => ({ ...prev, domains }));

        // Load terms for all domains if no specific domain is selected
        if (domains.length > 0) {
          await loadAllTerms(domains);
        }
      }
    } catch (error) {
      console.error("Failed to load domains:", error);
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  const loadAllTerms = async (domains: string[]) => {
    try {
      const allCategories: Category[] = [];

      for (const domain of domains) {
        const response = await chrome.runtime.sendMessage({
          action: "getTerms",
          domain,
        });

        if (response.success && response.terms) {
          // Add domain prefix to category names to avoid conflicts
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
  };

  const loadTermsForDomain = async (domain: string) => {
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
  };

  const saveTerms = async (categories?: Category[]) => {
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
  };

  const saveTermsForDomain = async (categories: Category[], domain: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "saveTerms",
        terms: categories,
        domain,
      });

      // Update domains list if it's a new domain
      if (!state.domains.includes(domain)) {
        setState((prev) => ({
          ...prev,
          domains: [...prev.domains, domain],
        }));
      }
    } catch (error) {
      console.error("Failed to save terms for domain:", error);
    }
  };

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

  const virtualizer = useVirtualizer({
    count: filteredTerms.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const addNewTerm = async () => {
    if (!state.newTerm.original || !state.newTerm.translated) return;
    if (!state.newDomainForTerm) {
      console.log("Showing toast error");
      toast.error("Please select a domain to add terms");
      return;
    }

    const categoryName =
      state.selectedCategory === "all" ? "General" : state.selectedCategory;

    try {
      // Load existing categories for the target domain
      const response = await chrome.runtime.sendMessage({
        action: "getTerms",
        domain: state.newDomainForTerm,
      });

      let targetCategories: Category[] = [];
      if (response.success && response.terms) {
        targetCategories = [...response.terms];
      }

      // Find or create the category in the target domain
      let category = targetCategories.find((cat) => cat.name === categoryName);
      if (!category) {
        category = { name: categoryName, terms: [] };
        targetCategories.push(category);
      }

      // Add the new term to the target domain's category
      category.terms.push({
        original: state.newTerm.original!,
        translated: state.newTerm.translated!,
        description: state.newTerm.description || "",
        template: state.newTerm.template || "",
      });

      // Save the updated categories to the target domain
      await saveTermsForDomain(targetCategories, state.newDomainForTerm);

      // Update UI state
      setState((prev) => ({
        ...prev,
        newTerm: { original: "", translated: "", description: "" },
        newDomainForTerm: "",
      }));

      // Refresh the current view if we're viewing the same domain or if "All Domains" is selected
      if (
        state.selectedDomain === state.newDomainForTerm ||
        state.selectedDomain === "all"
      ) {
        if (state.selectedDomain === "all") {
          // When "All Domains" is selected, reload all terms to include the new domain
          const updatedDomains = state.domains.includes(state.newDomainForTerm)
            ? state.domains
            : [...state.domains, state.newDomainForTerm];
          await loadAllTerms(updatedDomains);
        } else {
          // When specific domain is selected, just update the categories
          setState((prev) => ({
            ...prev,
            categories: targetCategories,
          }));
        }
      }

      // Show success message
      console.log("Showing toast success");
      toast.success(
        `Term "${state.newTerm.original}" successfully added to domain "${state.newDomainForTerm}"`
      );
    } catch (error) {
      console.error("Failed to add new term:", error);
      console.log("Showing toast error");
      toast.error("Failed to add new term. Please try again.");
    }
  };

  const editTerm = (term: TermsType & { categoryName: string }) => {
    setState((prev) => ({
      ...prev,
      editingTerm: { ...term },
      originalEditingTerm: { ...term },
      isDialogOpen: true,
    }));
  };

  const updateTerm = async () => {
    if (!state.editingTerm || !state.originalEditingTerm) return;

    if (state.selectedDomain === "all") {
      // When "All Domains" is selected, extract the domain from the category name
      const domainMatch =
        state.originalEditingTerm.categoryName.match(/^(.+?) - (.+)$/);
      if (domainMatch) {
        const [, domain, originalCategoryName] = domainMatch;

        // Load current terms for this domain
        const response = await chrome.runtime.sendMessage({
          action: "getTerms",
          domain,
        });

        if (response.success && response.terms) {
          // Update the term in the appropriate category
          const updatedCategories = response.terms.map((cat: Category) => {
            if (cat.name === originalCategoryName) {
              return {
                ...cat,
                terms: cat.terms.map((term: TermsType) =>
                  term.original === state.originalEditingTerm!.original
                    ? ({
                        original: state.editingTerm!.original,
                        translated: state.editingTerm!.translated,
                        description: state.editingTerm!.description,
                        template: state.editingTerm!.template,
                      } as TermsType)
                    : term
                ),
              };
            }
            return cat;
          });

          // Save to the specific domain
          await chrome.runtime.sendMessage({
            action: "saveTerms",
            terms: updatedCategories,
            domain,
          });

          // Reload all terms to refresh the UI
          await loadAllTerms(state.domains);
        }
      }
    } else {
      // When a specific domain is selected, use the existing logic
      setState((prev) => {
        const categories = prev.categories.map((cat) => {
          if (cat.name === prev.originalEditingTerm!.categoryName) {
            return {
              ...cat,
              terms: cat.terms.map((term) =>
                term.original === prev.originalEditingTerm!.original
                  ? ({
                      original: state.editingTerm!.original,
                      translated: state.editingTerm!.translated,
                      description: state.editingTerm!.description,
                      template: state.editingTerm!.template,
                    } as TermsType)
                  : term
              ),
            };
          }
          return cat;
        });

        // Save the updated categories immediately
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

    // Clear editing state
    setState((prev) => ({
      ...prev,
      editingTerm: null,
      originalEditingTerm: null,
      isDialogOpen: false,
    }));
  };

  const cancelEdit = () => {
    setState((prev) => ({
      ...prev,
      editingTerm: null,
      originalEditingTerm: null,
      isDialogOpen: false,
    }));
  };

  const deleteTerm = async (
    termToDelete: TermsType & { categoryName: string }
  ) => {
    try {
      if (state.selectedDomain === "all") {
        // When "All Domains" is selected, extract the domain from the category name
        const domainMatch = termToDelete.categoryName.match(/^(.+?) - (.+)$/);
        if (domainMatch) {
          const [, domain, originalCategoryName] = domainMatch;

          // Load current terms for this domain
          const response = await chrome.runtime.sendMessage({
            action: "getTerms",
            domain,
          });

          if (response.success && response.terms) {
            // Remove the term from the appropriate category
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

            // Save to the specific domain
            await chrome.runtime.sendMessage({
              action: "saveTerms",
              terms: updatedCategories,
              domain,
            });

            // Reload all terms to refresh the UI
            await loadAllTerms(state.domains);

            // Show success toast
            toast.success(
              `Term "${termToDelete.original}" deleted successfully`
            );
          } else {
            toast.error("Failed to delete term. Please try again.");
          }
        }
      } else {
        // When a specific domain is selected, use the existing logic
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

          // Save the updated categories immediately
          saveTerms(categories);

          return { ...prev, categories };
        });

        // Show success toast
        toast.success(`Term "${termToDelete.original}" deleted successfully`);
      }
    } catch (error) {
      console.error("Failed to delete term:", error);
      toast.error("Failed to delete term. Please try again.");
    }
  };

  const clearAllTerms = async () => {
    try {
      if (state.selectedDomain === "all") {
        // Clear all terms for all domains
        for (const domain of state.domains) {
          await chrome.runtime.sendMessage({
            action: "saveTerms",
            terms: [],
            domain,
          });
        }

        // Reload all terms to ensure consistency
        await loadAllTerms(state.domains);

        toast.success("All terms cleared for all domains");
      } else {
        // Clear all categories for the selected domain
        await chrome.runtime.sendMessage({
          action: "saveTerms",
          terms: [],
          domain: state.selectedDomain,
        });

        // Reload terms for the current domain to ensure consistency
        await loadTermsForDomain(state.selectedDomain);

        toast.success(`All terms cleared for domain "${state.selectedDomain}"`);
      }

      // Close the dialog
      setState((prev) => ({
        ...prev,
        isClearAllDialogOpen: false,
      }));
    } catch (error) {
      console.error("Failed to clear all terms:", error);
      toast.error("Failed to clear all terms. Please try again.");
    }
  };

  const openClearAllDialog = () => {
    setState((prev) => ({ ...prev, isClearAllDialogOpen: true }));
  };

  const closeClearAllDialog = () => {
    setState((prev) => ({ ...prev, isClearAllDialogOpen: false }));
  };

  const categoryOptions = useMemo(() => {
    const categories = state.categories.map((cat) => cat.name);
    return ["all", ...categories];
  }, [state.categories]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading terms...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Terms Management
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage your translation terminology and specialized vocabulary
          </p>
        </div>

        {/* Two-column grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column - Controls */}
          <div className="space-y-6">
            {/* Search and Filter Controls */}
            <Card>
              <CardHeader>
                <CardTitle>Search & Filter</CardTitle>
                <CardDescription>
                  Find and organize your translation terms
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="search">Search Terms</Label>
                    {/** biome-ignore lint/nursery/useUniqueElementIds: <explanation> */}
                    <Input
                      id="search"
                      value={state.searchQuery}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          searchQuery: e.target.value,
                        }))
                      }
                      placeholder="Search by original text, translation, or description..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="domain">Filter by Domain</Label>
                    <Select
                      value={state.selectedDomain}
                      onValueChange={(value) =>
                        setState((prev) => ({
                          ...prev,
                          selectedDomain: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select domain" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Domains</SelectItem>
                        {state.domains.map((domain) => (
                          <SelectItem key={domain} value={domain}>
                            {domain}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Filter by Category</Label>
                    <Select
                      value={state.selectedCategory}
                      onValueChange={(value) =>
                        setState((prev) => ({
                          ...prev,
                          selectedCategory: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category === "all" ? "All Categories" : category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Add New Term */}
            <Card>
              <CardHeader>
                <CardTitle>Add New Term</CardTitle>
                <CardDescription>
                  Add a new translation term to your vocabulary
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="domain">Domain</Label>
                    <Combobox
                      value={state.newDomainForTerm}
                      onChange={(value: string) =>
                        setState((prev) => ({
                          ...prev,
                          newDomainForTerm: value,
                        }))
                      }
                    >
                      <div className="relative">
                        <ComboboxInput
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          displayValue={(domain: string) => domain}
                          onChange={(event) =>
                            setState((prev) => ({
                              ...prev,
                              newDomainForTerm: event.target.value,
                            }))
                          }
                          placeholder="Type domain name..."
                        />
                        <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                          <ChevronsUpDown className="h-4 w-4 text-gray-400" />
                        </Combobox.Button>
                        <Combobox.Options className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                          {state.domains
                            .filter((domain) => {
                              if (!state.newDomainForTerm) return true;
                              return domain
                                .toLowerCase()
                                .includes(state.newDomainForTerm.toLowerCase());
                            })
                            .map((domain) => (
                              <Combobox.Option
                                key={domain}
                                value={domain}
                                className={({ active }) =>
                                  `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                    active
                                      ? "bg-blue-600 text-white"
                                      : "text-gray-900"
                                  }`
                                }
                              >
                                {({ selected, active }) => (
                                  <>
                                    <span
                                      className={`block truncate ${
                                        selected ? "font-medium" : "font-normal"
                                      }`}
                                    >
                                      {domain}
                                    </span>
                                    {selected ? (
                                      <span
                                        className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                          active
                                            ? "text-white"
                                            : "text-blue-600"
                                        }`}
                                      >
                                        <Check className="h-4 w-4" />
                                      </span>
                                    ) : null}
                                  </>
                                )}
                              </Combobox.Option>
                            ))}
                          {state.newDomainForTerm &&
                            !state.domains.some(
                              (d) =>
                                d.toLowerCase() ===
                                state.newDomainForTerm.toLowerCase()
                            ) && (
                              <Combobox.Option
                                value={state.newDomainForTerm}
                                className={({ active }) =>
                                  `relative cursor-default select-none py-2 pl-10 pr-4 border-t ${
                                    active
                                      ? "bg-blue-600 text-white"
                                      : "text-gray-900"
                                  }`
                                }
                              >
                                {({ active }) => (
                                  <>
                                    <span className="block truncate font-normal">
                                      Add "{state.newDomainForTerm}"
                                    </span>
                                    <span
                                      className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                        active ? "text-white" : "text-blue-600"
                                      }`}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </span>
                                  </>
                                )}
                              </Combobox.Option>
                            )}
                        </Combobox.Options>
                      </div>
                    </Combobox>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="original">Original Text</Label>
                    {/** biome-ignore lint/nursery/useUniqueElementIds: <explanation> */}
                    <Input
                      id="original"
                      value={state.newTerm.original || ""}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          newTerm: {
                            ...prev.newTerm,
                            original: e.target.value,
                          },
                        }))
                      }
                      placeholder="Original text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="translated">Translation</Label>
                    {/** biome-ignore lint/nursery/useUniqueElementIds: <explanation> */}
                    <Input
                      id="translated"
                      value={state.newTerm.translated || ""}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          newTerm: {
                            ...prev.newTerm,
                            translated: e.target.value,
                          },
                        }))
                      }
                      placeholder="Translation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    {/** biome-ignore lint/nursery/useUniqueElementIds: <explanation> */}
                    <Input
                      id="description"
                      value={state.newTerm.description || ""}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          newTerm: {
                            ...prev.newTerm,
                            description: e.target.value,
                          },
                        }))
                      }
                      placeholder="Description (optional)"
                    />
                  </div>
                </div>
                <Button
                  data-testid="add-term-button"
                  onClick={addNewTerm}
                  disabled={
                    !state.newTerm.original ||
                    !state.newTerm.translated ||
                    !state.newDomainForTerm
                  }
                  className="w-full"
                >
                  Add Term{" "}
                  {!state.newDomainForTerm ? "(Select a domain first)" : ""}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right column - Terms List */}
          <div className="space-y-6">
            <Card className="h-fit">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Terms</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {filteredTerms.length} term
                      {filteredTerms.length !== 1 ? "s" : ""}
                    </Badge>
                    {filteredTerms.length > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={openClearAllDialog}
                        className="h-7 text-xs"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Clear All
                      </Button>
                    )}
                  </div>
                </div>
                <CardDescription>
                  Manage your translation vocabulary
                  {state.selectedDomain !== "all" && (
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      for domain "{state.selectedDomain}"
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  ref={parentRef}
                  className="h-96 lg:h-[calc(100vh-300px)] overflow-auto"
                >
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                      const term = filteredTerms[virtualItem.index];

                      return (
                        <div
                          key={virtualItem.key}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: `${virtualItem.size}px`,
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                          className="border-b border-gray-100 p-4"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div
                                  className="font-medium text-gray-900 truncate"
                                  title={term.template}
                                >
                                  {term.original}
                                </div>
                                <div className="text-gray-600">→</div>
                                <div className="text-blue-600 truncate">
                                  {term.translated}
                                </div>
                                <Badge variant="outline" className="shrink-0">
                                  {term.categoryName}
                                </Badge>
                              </div>
                              {term.description && (
                                <div className="text-sm text-gray-500 mt-1 line-clamp-2">
                                  {term.description}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 ml-4 shrink-0">
                              <Button
                                onClick={() => editTerm(term)}
                                variant="ghost"
                                size="sm"
                                className="h-8 text-primary hover:text-primary"
                              >
                                Edit
                              </Button>
                              <Button
                                onClick={() => deleteTerm(term)}
                                variant="ghost"
                                size="sm"
                                className="h-8 text-destructive hover:text-destructive"
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Edit Term Dialog */}
        <Dialog
          open={state.isDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              cancelEdit();
            }
          }}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Term</DialogTitle>
              <DialogDescription>
                Update the translation term and its details.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={originalId} className="text-right">
                  Original
                </Label>
                <Input
                  id={originalId}
                  value={state.editingTerm?.original ?? ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      editingTerm: prev.editingTerm
                        ? {
                            ...prev.editingTerm,
                            original: e.target.value,
                          }
                        : null,
                    }))
                  }
                  className="col-span-3"
                  placeholder="Original text"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={translatedId} className="text-right">
                  Translation
                </Label>
                <Input
                  id={translatedId}
                  value={state.editingTerm?.translated ?? ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      editingTerm: prev.editingTerm
                        ? {
                            ...prev.editingTerm,
                            translated: e.target.value,
                          }
                        : null,
                    }))
                  }
                  className="col-span-3"
                  placeholder="Translation"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={descriptionId} className="text-right">
                  Description
                </Label>
                <Input
                  id={descriptionId}
                  value={state.editingTerm?.description ?? ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      editingTerm: prev.editingTerm
                        ? {
                            ...prev.editingTerm,
                            description: e.target.value,
                          }
                        : null,
                    }))
                  }
                  className="col-span-3"
                  placeholder="Description (optional)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button
                onClick={updateTerm}
                disabled={
                  !state.editingTerm?.original || !state.editingTerm?.translated
                }
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Clear All Terms Confirmation Dialog */}
        <Dialog
          open={state.isClearAllDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeClearAllDialog();
            }
          }}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Clear All Terms</DialogTitle>
              <DialogDescription>
                {state.selectedDomain === "all" ? (
                  <>
                    Are you sure you want to clear all terms for all domains?
                    This action cannot be undone and will permanently delete all
                    terms and categories across all domains.
                  </>
                ) : (
                  <>
                    Are you sure you want to clear all terms for domain "
                    {state.selectedDomain}"? This action cannot be undone and
                    will permanently delete all terms and categories for this
                    domain.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={closeClearAllDialog}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={clearAllTerms}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Terms
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Toaster position="top-right" expand={false} richColors />
    </div>
  );
}
