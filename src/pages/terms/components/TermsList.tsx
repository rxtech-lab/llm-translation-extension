import { Badge } from "@src/components/ui/badge";
import { Button } from "@src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@src/components/ui/card";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2 } from "lucide-react";
import React from "react";
import { Terms as TermsType } from "../../../translator/llm/translator";

interface TermsListProps {
  filteredTerms: (TermsType & { categoryName: string })[];
  selectedDomain: string;
  onEditTerm: (term: TermsType & { categoryName: string }) => void;
  onDeleteTerm: (term: TermsType & { categoryName: string }) => void;
  onClearAll: () => void;
}

export function TermsList({
  filteredTerms,
  selectedDomain,
  onEditTerm,
  onDeleteTerm,
  onClearAll,
}: TermsListProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: filteredTerms.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  return (
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
                onClick={onClearAll}
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
          {selectedDomain !== "all" && (
            <span className="text-sm text-muted-foreground">
              {" "}
              for domain "{selectedDomain}"
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
                        onClick={() => onEditTerm(term)}
                        variant="ghost"
                        size="sm"
                        className="h-8 text-primary hover:text-primary"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => onDeleteTerm(term)}
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
  );
}