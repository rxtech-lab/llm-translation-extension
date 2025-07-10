import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@src/components/ui/card";
import { Input } from "@src/components/ui/input";
import { Label } from "@src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui/select";
import { TermsPageState } from "../hooks/useTerms";

interface SearchAndFilterProps {
  state: TermsPageState;
  categoryOptions: string[];
  updateState: (updater: (prev: TermsPageState) => TermsPageState) => void;
}

export function SearchAndFilter({ state, categoryOptions, updateState }: SearchAndFilterProps) {
  return (
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
                updateState((prev) => ({
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
                updateState((prev) => ({
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
                updateState((prev) => ({
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
  );
}