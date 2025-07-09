import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@src/components/ui/card";
import { Input } from "@src/components/ui/input";
import { Label } from "@src/components/ui/label";
import type { TermsPageState } from "../hooks/useTerms";
import { DomainCombobox } from "./DomainCombobox";
import { Button } from "@src/components/ui/button";

interface AddTermFormProps {
  state: TermsPageState;
  updateState: (updater: (prev: TermsPageState) => TermsPageState) => void;
  onAddTerm: () => void;
}

export function AddTermForm({
  state,
  updateState,
  onAddTerm,
}: AddTermFormProps) {
  return (
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
            <DomainCombobox
              value={state.newDomainForTerm}
              onChange={(value) =>
                updateState((prev) => ({
                  ...prev,
                  newDomainForTerm: value,
                }))
              }
              domains={state.domains}
              placeholder="Type domain name..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="original">Original Text</Label>
            {/** biome-ignore lint/nursery/useUniqueElementIds: <explanation> */}
            <Input
              id="original"
              value={state.newTerm.original || ""}
              onChange={(e) =>
                updateState((prev) => ({
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
                updateState((prev) => ({
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
                updateState((prev) => ({
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
          onClick={onAddTerm}
          disabled={
            !state.newTerm.original ||
            !state.newTerm.translated ||
            !state.newDomainForTerm
          }
          className="w-full"
        >
          Add Term {!state.newDomainForTerm ? "(Select a domain first)" : ""}
        </Button>
      </CardContent>
    </Card>
  );
}
