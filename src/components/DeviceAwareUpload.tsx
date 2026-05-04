'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  onUpload: (files: File[]) => void;
  onOpenLibrary?: () => void;
  hasLibraryImages?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export default function DeviceAwareUpload({
  onUpload,
  onOpenLibrary,
  hasLibraryImages = false,
  children,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Register the outside-click listener AFTER the current event cycle so the
  // click that just opened the menu isn't immediately caught by this handler.
  useEffect(() => {
    if (!open) return;
    let handler: (e: MouseEvent) => void;
    const id = setTimeout(() => {
      handler = (e: MouseEvent) => {
        const t = e.target as Node;
        if (!wrapperRef.current?.contains(t) && !menuRef.current?.contains(t)) {
          setOpen(false);
        }
      };
      document.addEventListener('click', handler);
    }, 0);
    return () => {
      clearTimeout(id);
      if (handler) document.removeEventListener('click', handler);
    };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!hasLibraryImages) {
      fileRef.current?.click();
      return;
    }
    if (wrapperRef.current) {
      const r = wrapperRef.current.getBoundingClientRect();
      const w = 200;
      const left =
        r.left + w > window.innerWidth ? Math.max(0, r.right - w) : r.left;
      setPos({ top: r.bottom + 6, left });
    }
    setOpen((v) => !v);
  }

  function pickFile() {
    setOpen(false);
    fileRef.current?.click();
  }

  function openLibrary() {
    setOpen(false);
    onOpenLibrary?.();
  }

  return (
    <div
      ref={wrapperRef}
      className={`relative inline-block ${className ?? ''}`}
      onClick={handleClick}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) onUpload(Array.from(files));
          e.target.value = '';
        }}
      />

      {children ?? (
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 type-level-2"
        >
          Upload
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
            }}
            className="min-w-[200px] bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 overflow-hidden"
          >
            {hasLibraryImages && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openLibrary();
                }}
                className="w-full text-left px-4 h-[44px] hover:bg-gray-50 flex items-center gap-3 type-level-2 text-gray-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-gray-400"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                Image Library
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                pickFile();
              }}
              className="w-full text-left px-4 h-[44px] hover:bg-gray-50 flex items-center gap-3 type-level-2 text-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-400"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              Upload Images
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
