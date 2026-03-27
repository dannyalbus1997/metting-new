'use client';

import React, { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: (value: string) => void;
  debounceDelay?: number;
  placeholder?: string;
}

export default function SearchInput({
  onChange,
  debounceDelay = 300,
  placeholder = 'Search...',
  value: initialValue = '',
  ...props
}: SearchInputProps) {
  const [value, setValue] = useState<string>(initialValue as string);
  const [debounceTimer, setDebounceTimer] = React.useState<NodeJS.Timeout | null>(
    null
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setValue(newValue);

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      const timer = setTimeout(() => {
        onChange?.(newValue);
      }, debounceDelay);

      setDebounceTimer(timer);
    },
    [onChange, debounceDelay, debounceTimer]
  );

  const handleClear = () => {
    setValue('');
    onChange?.('');
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />

      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
        {...props}
      />

      {value && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded transition-colors"
          aria-label="Clear search"
          type="button"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      )}
    </div>
  );
}
