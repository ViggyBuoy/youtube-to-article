"use client";

interface LanguageSelectProps {
  value: string;
  onChange: (lang: string) => void;
  disabled: boolean;
}

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
];

export default function LanguageSelect({ value, onChange, disabled }: LanguageSelectProps) {
  return (
    <div className="flex gap-2">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(lang.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            value === lang.value
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
