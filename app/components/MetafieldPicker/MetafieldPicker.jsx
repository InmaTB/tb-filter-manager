import { Autocomplete, BlockStack, Tag } from '@shopify/polaris';
import { useCallback, useEffect, useMemo, useState } from 'react';

// props:
// - sections: [{ title: string, options: { value: string, label: string }[] }]
// - value: string[]  (los value seleccionados, controlado desde arriba)
// - onChange: (nextSelected: string[]) => void
export function MetafieldPicker({ sections = [], value = [], onChange }) {
  const [selected, setSelected] = useState(value);
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState(sections);

  // sincroniza estado interno si cambian props controladas
  useEffect(() => setSelected(value ?? []), [value]);
  useEffect(() => setOptions(sections ?? []), [sections]);

  // índice rápido para pintar tags
  const valueToLabel = useMemo(() => {
    const m = new Map();
    (sections || []).forEach(sec => {
      (sec.options || []).forEach(opt => m.set(opt.value, opt.label));
    });
    return m;
  }, [sections]);

  // filtra manteniendo secciones
  const updateText = useCallback((val) => {
    setInputValue(val);
    if (!val) {
      setOptions(sections);
      return;
    }
    const re = new RegExp(val, 'i');
    const filtered = (sections || []).map(sec => ({
      title: sec.title,
      options: (sec.options || []).filter(o => re.test(o.label) || re.test(o.value)),
    }));
    setOptions(filtered);
  }, [sections]);

  const handleSelect = useCallback((newSelected) => {
    setSelected(newSelected);
    onChange?.(newSelected);
  }, [onChange]);

  const removeTag = useCallback((val) => () => {
    setSelected(prev => {
      const next = prev.filter(v => v !== val);
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const verticalContent = selected.length ? (
    <BlockStack spacing="extraTight" alignment="center">
      {selected.map(v => (
        <Tag key={v} onRemove={removeTag(v)}>
          {valueToLabel.get(v) ?? v}
        </Tag>
      ))}
    </BlockStack>
  ) : null;

  const textField = (
    <Autocomplete.TextField
      onChange={updateText}
      label="Filtros"
      labelHidden
      value={inputValue}
      placeholder="Busca metacampo…"
      verticalContent={verticalContent}
      autoComplete="off"
    />
  );

  return (
    <div>
      <Autocomplete
        allowMultiple
        options={options}    // [{title, options:[{value,label}]}]
        selected={selected}  // string[]
        textField={textField}
        onSelect={handleSelect}
        listTitle="Metafields"
      />
    </div>
  );
}
