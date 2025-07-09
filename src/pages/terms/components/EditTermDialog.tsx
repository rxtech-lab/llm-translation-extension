import { Button } from "@src/components/ui/button";
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
import { useId } from "react";
import { TermsPageState } from "../hooks/useTerms";

interface EditTermDialogProps {
  state: TermsPageState;
  updateState: (updater: (prev: TermsPageState) => TermsPageState) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function EditTermDialog({ state, updateState, onSave, onCancel }: EditTermDialogProps) {
  const originalId = useId();
  const translatedId = useId();
  const descriptionId = useId();

  return (
    <Dialog
      open={state.isDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
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
                updateState((prev) => ({
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
                updateState((prev) => ({
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
                updateState((prev) => ({
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
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={
              !state.editingTerm?.original || !state.editingTerm?.translated
            }
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}