import React from 'react';
import { formatCompact } from '../utils/format';

interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}

export const NumberInput = ({ value, onChange, className, style, placeholder = "0" }: NumberInputProps) => {
  const [localValue, setLocalValue] = React.useState(() => value === 0 ? '' : new Intl.NumberFormat('id-ID').format(value));

  React.useEffect(() => {
    let parseStr = localValue.toLowerCase().replace(/[^0-9mbk.,-]/g, '');
    let multiplier = 1;
    if (parseStr.endsWith('b')) { multiplier = 1000000000; parseStr = parseStr.replace('b', ''); }
    else if (parseStr.endsWith('m')) { multiplier = 1000000; parseStr = parseStr.replace('m', ''); }
    else if (parseStr.endsWith('k')) { multiplier = 1000; parseStr = parseStr.replace('k', ''); }
    parseStr = parseStr.replace(/\./g, '').replace(',', '.');
    const currentNum = parseFloat(parseStr) * multiplier;

    if (currentNum !== value && !(isNaN(currentNum) && value === 0)) {
      setLocalValue(value === 0 ? '' : new Intl.NumberFormat('id-ID').format(value));
    }
  }, [value, localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    setLocalValue(rawInput);

    let parseStr = rawInput.toLowerCase().replace(/[^0-9mbk.,-]/g, '');
    let multiplier = 1;
    
    if (parseStr.endsWith('b')) {
      multiplier = 1000000000;
      parseStr = parseStr.replace('b', '');
    } else if (parseStr.endsWith('m')) {
      multiplier = 1000000;
      parseStr = parseStr.replace('m', '');
    } else if (parseStr.endsWith('k')) {
      multiplier = 1000;
      parseStr = parseStr.replace('k', '');
    }

    parseStr = parseStr.replace(/\./g, '').replace(',', '.');
    
    if (parseStr === '-' || parseStr === '' || parseStr === '-.') {
      onChange(0);
      return;
    }

    const num = parseFloat(parseStr);
    if (!isNaN(num)) {
       onChange(num * multiplier);
    }
  };

  const handleBlur = () => {
    setLocalValue(value === 0 ? '' : new Intl.NumberFormat('id-ID').format(value));
  }

  return (
    <div style={{ width: style?.width || '100%' }}>
      <input 
        type="text" 
        value={localValue} 
        onChange={handleChange} 
        onBlur={handleBlur}
        className={className} 
        style={{ ...style, width: '100%' }} 
        placeholder={placeholder}
      />
      {Math.abs(value) >= 1000 && (
        <div style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', marginTop: '2px', textAlign: 'right', fontWeight: 700 }}>
          {formatCompact(value)}
        </div>
      )}
    </div>
  );
};
