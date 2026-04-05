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
  const [isMobile, setIsMobile] = useState(false);
  const [cameraStage, setCameraStage] = useState<'idle' | 'live' | 'preview'>(
    'idle'
  );
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const closeCamera = useCallback(() => {
    stopStream();
    setCameraStage('idle');
    setCapturedDataUrl(null);
  }, [stopStream]);

  const openCamera = useCallback(async () => {
    setIsOpen(false);
    setCameraStage('live');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      closeCamera();
    }
  }, [closeCamera]);

  // Attach stream to video element after it mounts
  const liveVideoRef = useCallback((node: HTMLVideoElement | null) => {
    (
      videoRef as React.RefObject<HTMLVideoElement | null> & {
        current: HTMLVideoElement | null;
      }
    ).current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
    }
  }, []);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.92));
    stopStream();
    setCameraStage('preview');
  }, [stopStream]);

  const acceptPhoto = useCallback(() => {
    if (!capturedDataUrl) return;
    fetch(capturedDataUrl)
      .then((r) => r.blob())
      .then((blob) => {
        const file = new File([blob], `photo_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        onUpload([file]);
      });
    closeCamera();
  }, [capturedDataUrl, onUpload, closeCamera]);

  const openFilePicker = (accept: string, multiple = false) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) onUpload(Array.from(files));
      setIsOpen(false);
    };
    input.click();
  };

  const handleSourceSelect = (source: string) => {
    if (source === 'media' && onOpenLibrary) {
      onOpenLibrary();
      setIsOpen(false);
      return;
    }
    if (source === 'camera') {
      openCamera();
      return;
    }
    if (source === 'gallery') {
      // `accept="image/*"` without capture → opens gallery picker on iOS & Android
      openFilePicker('image/*', true);
      setIsOpen(false);
      return;
    }
    if (source === 'file') {
      // No accept restriction → opens the OS file browser / Files app
      openFilePicker('*/*', true);
      setIsOpen(false);
      return;
    }
    if (source === 'directory') {
      const input = document.createElement('input');
      input.type = 'file';
      (
        input as HTMLInputElement & { webkitdirectory: boolean }
      ).webkitdirectory = true;
      input.onchange = (e: Event) => {
        const files = (e.target as HTMLInputElement).files;
        if (files) onUpload(Array.from(files));
        setIsOpen(false);
      };
      input.click();
    }
  };

  const DesktopMenu = () => (
    <div className="absolute top-full mt-2 right-0 lg:left-0 lg:right-auto z-50 min-w-[220px] max-w-[100vw] sm:max-w-xs bg-white rounded-lg shadow-lg border border-gray-100 py-2">
      <div className="absolute -top-2 right-4 lg:right-auto lg:left-4 w-4 h-4 bg-white border-t border-l border-gray-100 transform rotate-45" />
      {hasLibraryImages && (
        <>
          <button
            onClick={() => handleSourceSelect('media')}
            className="w-full text-left px-4 h-[44px] hover:bg-gray-50 flex items-center gap-3"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-500"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <span className="text-sm text-gray-700">Image Library</span>
          </button>
          <div className="h-px bg-gray-100 my-1 mx-4" />
        </>
      )}
      <button
        onClick={() => handleSourceSelect('directory')}
        className="w-full text-left px-4 h-[44px] hover:bg-gray-50 flex items-center gap-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-500"
        >
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
        <span className="text-sm text-gray-700">Local Directory</span>
      </button>
    </div>
  );

  const MobileMenu = () => (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setIsOpen(false)}
      />
      <div className="relative bg-white w-full rounded-t-2xl pb-8 pt-2 px-4">
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />
        <div className="flex flex-col">
          {hasLibraryImages && (
            <button
              onClick={() => handleSourceSelect('media')}
              className="h-[64px] flex items-center justify-between border-b border-gray-100"
            >
              <div className="flex items-center gap-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-gray-600"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                <div className="text-left">
                  <div className="text-base font-medium text-gray-900">
                    Image Library
                  </div>
                  <div className="text-sm text-gray-500">
                    Choose from existing media
                  </div>
                </div>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-400"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          )}

          <button
            onClick={() => handleSourceSelect('gallery')}
            className="h-[64px] flex items-center justify-between border-b border-gray-100"
          >
            <div className="flex items-center gap-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-600"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <div className="text-left">
                <div className="text-base font-medium text-gray-900">
                  Gallery
                </div>
                <div className="text-sm text-gray-500">
                  Choose from device gallery
                </div>
              </div>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

          <button
            onClick={() => handleSourceSelect('file')}
            className="h-[64px] flex items-center justify-between border-b border-gray-100"
          >
            <div className="flex items-center gap-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-600"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              </svg>
              <div className="text-left">
                <div className="text-base font-medium text-gray-900">File</div>
                <div className="text-sm text-gray-500">Browse phone files</div>
              </div>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

          <button
            onClick={() => handleSourceSelect('camera')}
            className="h-[64px] flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-600"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <div className="text-left">
                <div className="text-base font-medium text-gray-900">
                  Camera
                </div>
                <div className="text-sm text-gray-500">Take a new photo</div>
              </div>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <button
          onClick={() => setIsOpen(false)}
          className="w-full h-[56px] mt-4 mb-4 bg-gray-100 rounded-xl text-gray-900 font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // Camera overlay — live viewfinder + photo preview
  const CameraOverlay = () => (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4">
        <button
          onClick={closeCamera}
          className="text-white text-sm font-medium px-3 py-1.5 rounded-lg bg-white/20"
        >
          Cancel
        </button>
        <span className="text-white text-sm font-semibold">
          {cameraStage === 'live' ? 'Take Photo' : 'Use Photo?'}
        </span>
        <div className="w-16" />
      </div>

      {/* Viewfinder / Preview */}
      <div className="flex-1 relative overflow-hidden">
        {cameraStage === 'live' && (
          <video
            ref={liveVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {cameraStage === 'preview' && capturedDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capturedDataUrl}
            alt="Captured"
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
      </div>

      {/* Controls */}
      <div className="pb-16 pt-6 flex items-center justify-center gap-8">
        {cameraStage === 'live' && (
          <button
            onClick={takePhoto}
            className="w-20 h-20 rounded-full bg-white border-4 border-white/40 shadow-lg active:scale-95 transition-transform"
          />
        )}
        {cameraStage === 'preview' && (
          <>
            <button
              onClick={() => {
                setCapturedDataUrl(null);
                openCamera();
              }}
              className="flex-1 mx-6 h-14 rounded-2xl bg-white/20 text-white font-semibold text-base"
            >
              Retake
            </button>
            <button
              onClick={acceptPhoto}
              className="flex-1 mx-6 h-14 rounded-2xl bg-white text-gray-900 font-semibold text-base"
            >
              Use Photo
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`relative inline-block ${className || ''}`}
      ref={containerRef}
    >
      <div onClick={() => setIsOpen(!isOpen)}>
        {children || (
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            <span>Upload</span>
          </button>
        )}
      </div>

      {isOpen &&
        (isMobile ? (
          createPortal(<MobileMenu />, document.body)
        ) : (
          <DesktopMenu />
        ))}

      {cameraStage !== 'idle' && createPortal(<CameraOverlay />, document.body)}
    </div>
  );
}
