import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  className = "",
  autoFocus = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || "");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value || "");
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // If closed without selecting, revert to value (or keep custom text if logic permits)
        if (document.activeElement !== containerRef.current?.querySelector('input')) {
             setSearchTerm(value || ""); 
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (opt: string) => {
    onChange(opt);
    setSearchTerm(opt);
    setIsOpen(false);
  };

  const handleCustomAdd = () => {
    if (searchTerm.trim()) {
      onChange(searchTerm.trim());
      setIsOpen(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomAdd();
    }
  };

  const isDangerValue = searchTerm === '退款' || searchTerm === '跑单';

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      <div className={`flex items-center border rounded-sm bg-white focus-within:ring-1 focus-within:ring-blue-500 transition-colors ${isDangerValue ? 'border-red-300 focus-within:border-red-500 bg-red-50' : 'border-blue-300 focus-within:border-blue-500'}`}>
        <input
          type="text"
          className={`w-full p-1.5 text-sm bg-transparent outline-none placeholder-gray-400 ${isDangerValue ? 'text-red-600 font-bold' : 'text-gray-700'}`}
          placeholder={placeholder}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
        />
        <button 
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`p-1 outline-none ${isDangerValue ? 'text-red-400' : 'text-gray-400 hover:text-blue-600'}`}
          tabIndex={-1}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-y-auto animate-fade-in">
           {filteredOptions.length > 0 ? (
             filteredOptions.map((opt, idx) => {
               const isDangerOption = opt === '退款' || opt === '跑单';
               return (
                 <div 
                   key={idx} 
                   className={`p-2 text-sm cursor-pointer truncate transition-colors ${
                     isDangerOption 
                       ? 'text-red-600 hover:bg-red-50 font-medium' 
                       : 'text-gray-700 hover:bg-blue-50'
                   }`}
                   onClick={() => handleSelect(opt)}
                 >
                   {opt}
                 </div>
               );
             })
           ) : (
             <div className="p-2 text-xs text-gray-400 italic text-center">
               Press Enter to add "{searchTerm}"
             </div>
           )}
        </div>
      )}
    </div>
  );
};
