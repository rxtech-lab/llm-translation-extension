import { Toaster } from "sonner";
import { AddTermForm } from "./components/AddTermForm";
import { ClearAllDialog } from "./components/ClearAllDialog";
import { EditTermDialog } from "./components/EditTermDialog";
import { SearchAndFilter } from "./components/SearchAndFilter";
import { TermsList } from "./components/TermsList";
import { useTerms } from "./hooks/useTerms";

export default function Terms() {
  const { state, updateState, actions, computed } = useTerms();

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <SearchAndFilter
              state={state}
              categoryOptions={computed.categoryOptions}
              updateState={updateState}
            />
            <AddTermForm
              state={state}
              updateState={updateState}
              onAddTerm={actions.addNewTerm}
            />
          </div>

          <div className="space-y-6">
            <TermsList
              filteredTerms={computed.filteredTerms}
              selectedDomain={state.selectedDomain}
              onEditTerm={actions.editTerm}
              onDeleteTerm={actions.deleteTerm}
              onClearAll={actions.openClearAllDialog}
            />
          </div>
        </div>

        <EditTermDialog
          state={state}
          updateState={updateState}
          onSave={actions.updateTerm}
          onCancel={actions.cancelEdit}
        />

        <ClearAllDialog
          isOpen={state.isClearAllDialogOpen}
          selectedDomain={state.selectedDomain}
          onClose={actions.closeClearAllDialog}
          onConfirm={actions.clearAllTerms}
        />
      </div>
      <Toaster position="top-right" expand={false} richColors />
    </div>
  );
}
