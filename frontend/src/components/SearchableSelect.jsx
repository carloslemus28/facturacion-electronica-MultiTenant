import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function SearchableSelect({
  label,
  value,
  options = [],
  onChange,
  placeholder = 'Seleccione una opción',
  searchPlaceholder = 'Buscar...',
  emptyText = 'No se encontraron resultados',
  disabled = false,
  required = false,
  helperText = '',
  errorText = '',
  getOptionLabel = (option) => option.label,
  getOptionValue = (option) => option.value,
  getOptionDescription = (option) => option.description,
  className = ''
}) {
  const wrapperRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedOption = useMemo(() => {
    return options.find((option) => String(getOptionValue(option)) === String(value)) || null;
  }, [options, value, getOptionValue]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
      return options.slice(0, 80);
    }

    return options
      .filter((option) => {
        const labelText = normalizeText(getOptionLabel(option));
        const descriptionText = normalizeText(getOptionDescription(option));
        const valueText = normalizeText(getOptionValue(option));

        return (
          labelText.includes(normalizedQuery) ||
          descriptionText.includes(normalizedQuery) ||
          valueText.includes(normalizedQuery)
        );
      })
      .slice(0, 80);
  }, [options, query, getOptionLabel, getOptionDescription, getOptionValue]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!wrapperRef.current) return;

      if (!wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (option) => {
    onChange?.(option);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (event) => {
    event.stopPropagation();
    onChange?.(null);
    setQuery('');
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {label && (
        <label className="block text-sm text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        className={`w-full border rounded-xl px-4 py-3 text-left outline-none bg-white flex items-center justify-between gap-3 ${
          disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
            : 'border-gray-300 hover:border-blue-800 focus:ring-2 focus:ring-blue-800'
        } ${errorText ? 'border-red-400' : ''}`}
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption ? getOptionLabel(selectedOption) : placeholder}
        </span>

        <span className="flex items-center gap-2 shrink-0">
          {selectedOption && !disabled && (
            <X
              size={16}
              className="text-gray-400 hover:text-red-600"
              onClick={handleClear}
            />
          )}
          <ChevronDown size={18} className="text-gray-400" />
        </span>
      </button>

      {helperText && !errorText && (
        <p className="text-xs text-gray-500 mt-1">{helperText}</p>
      )}

      {errorText && (
        <p className="text-xs text-red-600 mt-1">{errorText}</p>
      )}

      {open && (
        <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-3 border-b bg-gray-50">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder={searchPlaceholder}
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="text-sm text-gray-500 p-4">
                {emptyText}
              </p>
            ) : (
              filteredOptions.map((option) => {
                const optionValue = getOptionValue(option);
                const optionLabel = getOptionLabel(option);
                const optionDescription = getOptionDescription(option);
                const active = String(optionValue) === String(value);

                return (
                  <button
                    type="button"
                    key={optionValue}
                    onClick={() => handleSelect(option)}
                    className={`w-full text-left px-4 py-3 hover:bg-blue-50 ${
                      active ? 'bg-blue-50 text-blue-900' : 'text-gray-800'
                    }`}
                  >
                    <p className="font-medium">{optionLabel}</p>

                    {optionDescription && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {optionDescription}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;