import { Combobox, ComboboxInput } from "@headlessui/react";
import { Check, Plus, ChevronsUpDown } from "lucide-react";

interface DomainComboboxProps {
  value: string;
  onChange: (value: string) => void;
  domains: string[];
  placeholder?: string;
}

export function DomainCombobox({ value, onChange, domains, placeholder = "Type domain name..." }: DomainComboboxProps) {
  return (
    <Combobox value={value} onChange={onChange}>
      <div className="relative">
        <ComboboxInput
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          displayValue={(domain: string) => domain}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronsUpDown className="h-4 w-4 text-gray-400" />
        </Combobox.Button>
        <Combobox.Options className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
          {domains
            .filter((domain) => {
              if (!value) return true;
              return domain.toLowerCase().includes(value.toLowerCase());
            })
            .map((domain) => (
              <Combobox.Option
                key={domain}
                value={domain}
                className={({ active }) =>
                  `relative cursor-default select-none py-2 pl-10 pr-4 ${
                    active ? "bg-blue-600 text-white" : "text-gray-900"
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
                          active ? "text-white" : "text-blue-600"
                        }`}
                      >
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                  </>
                )}
              </Combobox.Option>
            ))}
          {value &&
            !domains.some((d) => d.toLowerCase() === value.toLowerCase()) && (
              <Combobox.Option
                value={value}
                className={({ active }) =>
                  `relative cursor-default select-none py-2 pl-10 pr-4 border-t ${
                    active ? "bg-blue-600 text-white" : "text-gray-900"
                  }`
                }
              >
                {({ active }) => (
                  <>
                    <span className="block truncate font-normal">
                      Add "{value}"
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
  );
}