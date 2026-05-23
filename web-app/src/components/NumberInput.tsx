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
  const displayValue = value === 0 ? '' : new Intl.NumberFormat('id-ID').format(value);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawString = e.target.value.toLowerCase().replace(/[^0-9mbk]/g, '');
    let multiplier = 1;
    
    if (rawString.endsWith('b')) {
      multiplier = 1000000000;
      rawString = rawString.replace('b', '');
    } else if (rawString.endsWith('m')) {
      multiplier = 1000000;
      rawString = rawString.replace('m', '');
    } else if (rawString.endsWith('k')) {
      multiplier = 1000;
      rawString = rawString.replace('k', '');
    }

    const num = parseInt(rawString, 10);
    onChange(isNaN(num) ? 0 : num * multiplier);
  };

  return (
    <div style={{ width: style?.width || '100%' }}>
      <input 
        type="text" 
        value={displayValue} 
        onChange={handleChange} 
        className={className} 
        style={{ ...style, width: '100%' }} 
        placeholder={placeholder}
      />
      {value >= 1000 && (
        <div style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', marginTop: '2px', textAlign: 'right', fontWeight: 700 }}>
          {formatCompact(value)}
        </div>
      )}
    </div>
  );
};
