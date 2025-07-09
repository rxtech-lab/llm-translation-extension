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
import React, { useEffect, useId, useMemo, useState } from "react";
import { Category, Terms as TermsType } from "../../translator/llm/translator";

interface TermsPageState {
  categories: Category[];
  searchQuery: string;
  selectedCategory: string;
  editingTerm: TermsType | null;
  originalEditingTerm: (TermsType & { categoryName: string }) | null;
  newTerm: Partial<TermsType>;
  loading: boolean;
  isDialogOpen: boolean;
}

const initialState: TermsPageState = {
  categories: [],
  searchQuery: "",
  selectedCategory: "all",
  editingTerm: null,
  originalEditingTerm: null,
  newTerm: { original: "", translated: "", description: "", template: "" },
  loading: true,
  isDialogOpen: false,
};

export default function Terms() {
  const [state, setState] = useState<TermsPageState>(initialState);
  const parentRef = React.useRef<HTMLDivElement>(null);
  const originalId = useId();
  const translatedId = useId();
  const descriptionId = useId();

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    loadTerms();
  }, []);

  const loadTerms = async () => {
    try {
      const result = await chrome.storage.local.get(["translationTerms"]);
      if (result.translationTerms) {
        setState((prev) => ({ ...prev, categories: result.translationTerms }));
      }
    } catch (error) {
      console.error("Failed to load terms:", error);
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  const saveTerms = async (categories?: Category[]) => {
    const categoriesToSave = categories || state.categories;
    try {
      await chrome.storage.local.set({ translationTerms: categoriesToSave });

      // Notify all tabs about updated terms
      try {
        const tabs = await chrome.tabs.query({});
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                action: "termsUpdated",
                terms: categoriesToSave,
              })
              .catch(() => {
                // Ignore errors for tabs without content script
              });
          }
        });
      } catch (error) {
        console.error("Failed to notify tabs about terms update:", error);
      }
    } catch (error) {
      console.error("Failed to save terms:", error);
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

  const addNewTerm = () => {
    if (!state.newTerm.original || !state.newTerm.translated) return;

    const categoryName =
      state.selectedCategory === "all" ? "General" : state.selectedCategory;

    setState((prev) => {
      const categories = [...prev.categories];
      let category = categories.find((cat) => cat.name === categoryName);

      if (!category) {
        category = { name: categoryName, terms: [] };
        categories.push(category);
      }

      category.terms.push({
        original: prev.newTerm.original!,
        translated: prev.newTerm.translated!,
        description: prev.newTerm.description || "",
        template: prev.newTerm.template || "",
      });

      // Save the updated categories immediately
      saveTerms(categories);

      return {
        ...prev,
        categories,
        newTerm: { original: "", translated: "", description: "" },
      };
    });
  };

  const editTerm = (term: TermsType & { categoryName: string }) => {
    setState((prev) => ({
      ...prev,
      editingTerm: { ...term },
      originalEditingTerm: { ...term },
      isDialogOpen: true,
    }));
  };

  const updateTerm = () => {
    if (!state.editingTerm || !state.originalEditingTerm) return;

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
  };

  const cancelEdit = () => {
    setState((prev) => ({
      ...prev,
      editingTerm: null,
      originalEditingTerm: null,
      isDialogOpen: false,
    }));
  };

  const deleteTerm = (termToDelete: TermsType & { categoryName: string }) => {
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
                  onClick={addNewTerm}
                  disabled={
                    !state.newTerm.original || !state.newTerm.translated
                  }
                  className="w-full"
                >
                  Add Term
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
                  <Badge variant="secondary">
                    {filteredTerms.length} term
                    {filteredTerms.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <CardDescription>
                  Manage your translation vocabulary
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
      </div>
    </div>
  );
}
