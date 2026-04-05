'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface DeviceAwareUploadProps {
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
}: DeviceAwareUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on click outside — use 'click' so it fires AFTER button handlers
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isOpen]);

  const openMenu = useCallback(() => {
    if (!hasLibraryImages) {
      fileInputRef.current?.click();
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
      });
    }
    setIsOpen((v) => !v);
  }, [hasLibraryImages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) onUpload(Array.from(files));
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleLibrary = () => {
    setIsOpen(false);
    onOpenLibrary?.();
  };

  const handleUpload = () => {
    setIsOpen(false);
    fileInputRef.current?.click();
  };

  const Menu = () =>
    createPortal(
      <div
        className="fixed z-[9999] min-w-[200px] bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 overflow-hidden"
        style={{ top: menuPos.top, left: menuPos.left }}
      >
        {hasLibraryImages && (
          <button
            onClick={handleLibrary}
            className="w-full text-left px-4 h-[44px] hover:bg-gray-50 flex items-center gap-3 text-sm text-gray-700"
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
          onClick={handleUpload}
          className="w-full text-left px-4 h-[44px] hover:bg-gray-50 flex items-center gap-3 text-sm text-gray-700"
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
    );

  return (
    <div
      className={`relative inline-block ${className || ''}`}
      ref={triggerRef}
    >
      {/* Hidden native file input — OS handles gallery/camera/file natively */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div onClick={openMenu}>
        {children || (
          <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-medium">
            Upload
          </button>
        )}
      </div>

      {isOpen && <Menu />}
    </div>
  );
}
