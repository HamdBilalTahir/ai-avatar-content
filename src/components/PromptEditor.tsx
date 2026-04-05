import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';

type GlobalVar = {
  name: string;
  value: string;
};

type PromptEditorProps = {
  value: string;
  onChange: (val: string) => void;
  globals: GlobalVar[];
  placeholder?: string;
};

export default function PromptEditor({
  value,
  onChange,
  globals,
  placeholder,
}: PromptEditorProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [cursorPos, setCursorPos] = useState<number>(0);
  const [autocompleteQuery, setAutocompleteQuery] = useState<string | null>(
    null
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const caretMarkerRef = useRef<HTMLSpanElement>(null);

  // Sync scroll
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Find autocomplete match
  useEffect(() => {
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/\{([a-zA-Z0-9_-]*)$/);
    if (match && isFocused) {
      setAutocompleteQuery(match[1]);
      setSelectedIndex(0);
    } else {
      setAutocompleteQuery(null);
    }
  }, [value, cursorPos, isFocused]);

  // Update dropdown position
  useEffect(() => {
    if (
      autocompleteQuery !== null &&
      caretMarkerRef.current &&
      highlightRef.current?.parentElement
    ) {
      const markerRect = caretMarkerRef.current.getBoundingClientRect();
      const containerRect =
        highlightRef.current.parentElement.getBoundingClientRect();

      // Calculate top/left relative to the outer relative container
      let top = markerRect.bottom - containerRect.top + 4;
      let left = markerRect.left - containerRect.left;

      // Prevent dropdown from overflowing right edge
      if (left + 256 > containerRect.width) {
        left = containerRect.width - 256 - 16;
      }

      setDropdownPos({ top, left });
    }
  }, [autocompleteQuery, value, cursorPos]);

  const filteredGlobals =
    autocompleteQuery !== null
      ? globals.filter((g) =>
          g.name.toLowerCase().includes(autocompleteQuery.toLowerCase())
        )
      : [];

  const handleSelectAutocomplete = (varName: string) => {
    if (autocompleteQuery === null || !textareaRef.current) return;

    const textBeforeQuery = value.slice(
      0,
      cursorPos - autocompleteQuery.length - 1
    ); // -1 for the '{'
    const textAfterCursor = value.slice(cursorPos);

    // Add the variable and a closing brace with a trailing space
    const newValue = textBeforeQuery + `{${varName}} ` + textAfterCursor;
    onChange(newValue);

    // Calculate new cursor position (after the closing brace and space)
    const newCursorPos = textBeforeQuery.length + varName.length + 3;

    // Need a small timeout to let React update the value before setting cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        setCursorPos(newCursorPos);
      }
    }, 10);

    setAutocompleteQuery(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocompleteQuery !== null && filteredGlobals.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredGlobals.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + filteredGlobals.length) % filteredGlobals.length
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectAutocomplete(filteredGlobals[selectedIndex].name);
      } else if (e.key === 'Escape') {
        setAutocompleteQuery(null);
      }
    }
  };

  // Render highlighted text
  const renderHighlightedText = () => {
    const renderPart = (text: string, startIndex: number) => {
      // Regex matches {variableName}
      const regex = /(\{[a-zA-Z0-9_-]+\})/g;
      const parts = text.split(regex);

      return parts.map((part, i) => {
        if (regex.test(part)) {
          const varName = part.slice(1, -1);
          const exists = globals.some((g) => g.name === varName);

          // Note: We cannot use font-bold or padding (px/py) because it changes the text width
          // and misaligns the background div with the foreground transparent textarea.
          return (
            <span
              key={`${startIndex}-${i}`}
              className={`rounded-sm transition-all
                ${
                  exists
                    ? 'text-violet-700 bg-violet-100'
                    : 'text-red-600 bg-red-50'
                }`}
            >
              {part}
            </span>
          );
        }
        return <span key={`${startIndex}-${i}`}>{part}</span>;
      });
    };

    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);

    return (
      <>
        {renderPart(before, 0)}
        <span ref={caretMarkerRef} className="inline-block w-0 h-0" />
        {renderPart(after, 1)}
      </>
    );
  };

  return (
    <div className="relative w-full h-80">
      {/* Background Div for Highlighting */}
      <div
        ref={highlightRef}
        className={`absolute inset-0 w-full h-full bg-white border rounded-lg p-3 text-sm text-slate-700 font-sans whitespace-pre-wrap break-words overflow-hidden transition-colors
          ${isFocused ? 'border-violet-500 ring-1 ring-violet-500 shadow-sm' : 'border-slate-200 shadow-sm'}`}
        aria-hidden="true"
      >
        {renderHighlightedText()}
        {/* We add an invisible character at the end to ensure empty lines render correctly */}
        {value.endsWith('\n') && <br />}
      </div>

      {/* Foreground Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCursorPos(e.target.selectionStart);
        }}
        onClick={(e) => setCursorPos(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCursorPos(e.currentTarget.selectionStart)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          // Don't clear autocomplete immediately so clicks on the dropdown can register
          setTimeout(() => setAutocompleteQuery(null), 200);
        }}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className="absolute inset-0 w-full h-full p-3 text-sm font-sans whitespace-pre-wrap break-words bg-transparent text-transparent caret-slate-900 border border-transparent rounded-lg resize-none focus:outline-none focus:ring-0 z-10 m-0 overflow-y-auto"
        style={{
          color: 'transparent',
        }}
      />

      {/* Autocomplete Dropdown */}
      {autocompleteQuery !== null &&
        filteredGlobals.length > 0 &&
        isFocused && (
          <div
            className="absolute z-50 w-64 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden pointer-events-auto"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Variables
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filteredGlobals.map((g, i) => (
                <div
                  key={g.name}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent blur
                    handleSelectAutocomplete(g.name);
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors flex flex-col gap-0.5
                  ${i === selectedIndex ? 'bg-violet-50 text-violet-900' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <div className="font-mono font-semibold">{g.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {g.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
