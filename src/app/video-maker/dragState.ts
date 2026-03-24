/**
 * Module-level drag state shared between MediaPanel and TrackRow.
 * dataTransfer.getData() with custom keys is unreliable across React
 * render boundaries — a plain module variable is simpler and always works.
 */

let draggingMediaItemId: string | null = null;

export function setDraggingMedia(id: string | null) {
  draggingMediaItemId = id;
}

export function getDraggingMedia(): string | null {
  return draggingMediaItemId;
}

let hoverTrackId: string | null = null;

export function setHoverTrackId(id: string | null) {
  hoverTrackId = id;
}

export function getHoverTrackId(): string | null {
  return hoverTrackId;
}

let copiedClipId: string | null = null;

export function setCopiedClipId(id: string | null) {
  copiedClipId = id;
}

export function getCopiedClipId(): string | null {
  return copiedClipId;
}
