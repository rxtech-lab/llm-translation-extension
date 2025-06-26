import React, { useState, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@src/components/ui/card';
import { Input } from '@src/components/ui/input';
import { Label } from '@src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@src/components/ui/select';
import { Badge } from '@src/components/ui/badge';
import { Separator } from '@src/components/ui/separator';
import '@pages/content/style.css';
import { Category, Terms as TermsType } from '../../translator/llm/translator';

interface TermsPageState {
  categories: Category[];
  searchQuery: string;
  selectedCategory: string;
  editingTerm: TermsType | null;
  newTerm: Partial<TermsType>;
  loading: boolean;
}

const initialState: TermsPageState = {
  categories: [],
  searchQuery: '',
  selectedCategory: 'all',
  editingTerm: null,
  newTerm: { original: '', translated: '', description: '' },
  loading: true
};

export default function Terms() {
  const [state, setState] = useState<TermsPageState>(initialState);
  const parentRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTerms();
  }, []);

  const loadTerms = async () => {
    try {
      const result = await chrome.storage.local.get(['translationTerms']);
      if (result.translationTerms) {
        setState(prev => ({ ...prev, categories: result.translationTerms }));
      }
    } catch (error) {
      console.error('Failed to load terms:', error);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const saveTerms = async () => {
    try {
      await chrome.storage.local.set({ translationTerms: state.categories });
    } catch (error) {
      console.error('Failed to save terms:', error);
    }
  };

  const filteredTerms = useMemo(() => {
    const allTerms = state.categories.flatMap(cat => 
      cat.terms.map(term => ({ ...term, categoryName: cat.name }))
    );

    let filtered = allTerms;

    if (state.selectedCategory !== 'all') {
      filtered = filtered.filter(term => term.categoryName === state.selectedCategory);
    }

    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(term =>
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

    const categoryName = state.selectedCategory === 'all' ? 'General' : state.selectedCategory;
    
    setState(prev => {
      const categories = [...prev.categories];
      let category = categories.find(cat => cat.name === categoryName);
      
      if (!category) {
        category = { name: categoryName, terms: [] };
        categories.push(category);
      }
      
      category.terms.push({
        original: prev.newTerm.original!,
        translated: prev.newTerm.translated!,
        description: prev.newTerm.description || ''
      });

      return {
        ...prev,
        categories,
        newTerm: { original: '', translated: '', description: '' }
      };
    });

    saveTerms();
  };

  const editTerm = (term: TermsType & { categoryName: string }) => {
    setState(prev => ({
      ...prev,
      editingTerm: { ...term }
    }));
  };

  const updateTerm = () => {
    if (!state.editingTerm) return;

    setState(prev => {
      const categories = prev.categories.map(cat => {
        if (cat.name === (state.editingTerm as any).categoryName) {
          return {
            ...cat,
            terms: cat.terms.map(term =>
              term.original === state.editingTerm!.original
                ? {
                    original: state.editingTerm!.original,
                    translated: state.editingTerm!.translated,
                    description: state.editingTerm!.description
                  }
                : term
            )
          };
        }
        return cat;
      });

      return {
        ...prev,
        categories,
        editingTerm: null
      };
    });

    saveTerms();
  };

  const deleteTerm = (termToDelete: TermsType & { categoryName: string }) => {
    setState(prev => {
      const categories = prev.categories.map(cat => {
        if (cat.name === termToDelete.categoryName) {
          return {
            ...cat,
            terms: cat.terms.filter(term => term.original !== termToDelete.original)
          };
        }
        return cat;
      }).filter(cat => cat.terms.length > 0);

      return { ...prev, categories };
    });

    saveTerms();
  };

  const categoryOptions = useMemo(() => {
    const categories = state.categories.map(cat => cat.name);
    return ['all', ...categories];
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
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Terms Management</h1>
          <p className="text-lg text-muted-foreground">
            Manage your translation terminology and specialized vocabulary
          </p>
        </div>
        
        {/* Search and Filter Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Search & Filter</CardTitle>
            <CardDescription>Find and organize your translation terms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Search Terms</Label>
                <Input
                  id="search"
                  value={state.searchQuery}
                  onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
                  placeholder="Search by original text, translation, or description..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Filter by Category</Label>
                <Select
                  value={state.selectedCategory}
                  onValueChange={(value) => setState(prev => ({ ...prev, selectedCategory: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(category => (
                      <SelectItem key={category} value={category}>
                        {category === 'all' ? 'All Categories' : category}
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
            <CardDescription>Add a new translation term to your vocabulary</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="original">Original Text</Label>
                <Input
                  id="original"
                  value={state.newTerm.original || ''}
                  onChange={(e) => setState(prev => ({
                    ...prev,
                    newTerm: { ...prev.newTerm, original: e.target.value }
                  }))}
                  placeholder="Original text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="translated">Translation</Label>
                <Input
                  id="translated"
                  value={state.newTerm.translated || ''}
                  onChange={(e) => setState(prev => ({
                    ...prev,
                    newTerm: { ...prev.newTerm, translated: e.target.value }
                  }))}
                  placeholder="Translation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={state.newTerm.description || ''}
                  onChange={(e) => setState(prev => ({
                    ...prev,
                    newTerm: { ...prev.newTerm, description: e.target.value }
                  }))}
                  placeholder="Description (optional)"
                />
              </div>
            </div>
            <Button
              onClick={addNewTerm}
              disabled={!state.newTerm.original || !state.newTerm.translated}
              className="w-full md:w-auto"
            >
              Add Term
            </Button>
          </CardContent>
        </Card>

        {/* Terms List */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Terms</CardTitle>
              <Badge variant="secondary">
                {filteredTerms.length} term{filteredTerms.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <CardDescription>Manage your translation vocabulary</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
          
          <div
            ref={parentRef}
            className="h-96 overflow-auto"
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const term = filteredTerms[virtualItem.index];
                const isEditing = state.editingTerm?.original === term.original;

                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className="border-b border-gray-100 p-4"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            type="text"
                            value={state.editingTerm.original}
                            onChange={(e) => setState(prev => ({
                              ...prev,
                              editingTerm: prev.editingTerm ? { ...prev.editingTerm, original: e.target.value } : null
                            }))}
                            className="px-3 py-1 border border-gray-300 rounded text-sm"
                          />
                          <input
                            type="text"
                            value={state.editingTerm.translated}
                            onChange={(e) => setState(prev => ({
                              ...prev,
                              editingTerm: prev.editingTerm ? { ...prev.editingTerm, translated: e.target.value } : null
                            }))}
                            className="px-3 py-1 border border-gray-300 rounded text-sm"
                          />
                          <input
                            type="text"
                            value={state.editingTerm.description}
                            onChange={(e) => setState(prev => ({
                              ...prev,
                              editingTerm: prev.editingTerm ? { ...prev.editingTerm, description: e.target.value } : null
                            }))}
                            className="px-3 py-1 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={updateTerm}
                            size="sm"
                            className="h-8"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={() => setState(prev => ({ ...prev, editingTerm: null }))}
                            variant="outline"
                            size="sm"
                            className="h-8"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-4">
                            <div className="font-medium text-gray-900">{term.original}</div>
                            <div className="text-gray-600">→</div>
                            <div className="text-blue-600">{term.translated}</div>
                            <Badge variant="outline">{term.categoryName}</Badge>
                          </div>
                          {term.description && (
                            <div className="text-sm text-gray-500 mt-1">{term.description}</div>
                          )}
                        </div>
                        <div className="flex gap-2">
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
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}