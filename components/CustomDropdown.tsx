
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
    id: string;
    name: string;
}

interface CustomDropdownProps {
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    className?: string;
    triggerClassName?: string;
    formatLabel?: (name: string) => string;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({ 
    value, 
    options, 
    onChange, 
    className = '',
    triggerClassName = '',
    formatLabel = (name) => name.toLowerCase()
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.id === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className={`relative inline-block ${className}`} ref={dropdownRef}>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-bold transition-colors cursor-pointer ${triggerClassName}`}
            >
                <span className="truncate">{selectedOption ? formatLabel(selectedOption.name) : 'Select...'}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div 
                    className="absolute left-0 mt-2 w-56 rounded-xl bg-white shadow-2xl border border-slate-100 z-[9999] py-2 origin-top-left"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {options.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(option.id);
                                    setIsOpen(false);
                                }}
                                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                            >
                                <span className={option.id === value ? 'font-semibold text-slate-900' : ''}>
                                    {option.name}
                                </span>
                                {option.id === value && (
                                    <Check className="w-4 h-4 text-indigo-600" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
