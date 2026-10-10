import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';

export default function ModernSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = '',
  required,
  'aria-label': ariaLabel
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const selected = options.find(o => o.value === value) || null;

  const reposition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // position: fixed -> viewport coordinates
    setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (containerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return (
    <div ref={containerRef} className={`ms-root ${className}`}>
      {/* Hidden native select keeps form validation / accessibility working */}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        className="ms-native"
        tabIndex={-1}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        className={`ms-trigger${open ? ' is-open' : ''}`}
      >
        <span className={`ms-label${selected ? '' : ' is-placeholder'}`}>
          {selected ? selected.label : (placeholder || 'Select...')}
        </span>
        <span className={`ms-chev${open ? ' is-open' : ''}`}><ChevronDown size={14} /></span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dropdownRef}
              role="listbox"
              data-ms-menu=""
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ position: 'fixed', top: coords.top, left: coords.left, width: Math.max(coords.width, 180), zIndex: 9999 }}
              className="ms-menu"
            >
              <div className="ms-list">
                {options.map(option => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onClick={() => { onChange(option.value); setOpen(false); }}
                      className={`ms-option${isSelected ? ' is-selected' : ''}`}
                    >
                      <span className="ms-option-text">{option.label}</span>
                      {isSelected && <span className="ms-check"><Check size={12} strokeWidth={3} /></span>}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
