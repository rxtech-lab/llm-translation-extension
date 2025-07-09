import { Button } from "@src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@src/components/ui/dialog";
import { Trash2 } from "lucide-react";

interface ClearAllDialogProps {
  isOpen: boolean;
  selectedDomain: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ClearAllDialog({ isOpen, selectedDomain, onClose, onConfirm }: ClearAllDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Clear All Terms</DialogTitle>
          <DialogDescription>
            {selectedDomain === "all" ? (
              <>
                Are you sure you want to clear all terms for all domains?
                This action cannot be undone and will permanently delete all
                terms and categories across all domains.
              </>
            ) : (
              <>
                Are you sure you want to clear all terms for domain "
                {selectedDomain}"? This action cannot be undone and
                will permanently delete all terms and categories for this
                domain.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Terms
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}