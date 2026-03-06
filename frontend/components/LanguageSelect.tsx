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
              : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
