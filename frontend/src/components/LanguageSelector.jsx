// src/components/LanguageSelector.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function LanguageSelector() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const languages = [
    { code: 'fr',    icon: '🇫🇷', label: 'Français'  },
    { code: 'en-US', icon: '🇬🇧', label: 'English'    },
    { code: 'ar',    icon: '🇸🇦', label: 'العربية'   }
  ];

  const toggleOpen = () => setOpen(prev => !prev);
  const selectLanguage = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = languages.find(l => l.code === i18n.language) || languages[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggleOpen}
        className="flex items-center p-1 hover:bg-gray-200 rounded"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="text-2xl">{current.icon}</span>
      </button>

      {open && (
        <ul className="absolute right-0 mt-2 w-24 bg-white border border-gray-200 rounded shadow-lg overflow-y-auto max-h-40 z-50">
          {languages.map(lang => (
            <li key={lang.code}>
              <button
                onClick={() => selectLanguage(lang.code)}
                className="w-full flex items-center px-2 py-1 hover:bg-gray-100"
              >
                <span className="text-xl mr-2">{lang.icon}</span>
                <span className="text-sm">{lang.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
