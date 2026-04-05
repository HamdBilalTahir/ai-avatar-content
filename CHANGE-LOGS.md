## 🗓️ **2026-04-05**

---

### 🐛 Fixes

---

> ### Prompt Editor Autocomplete & Alignment Fixes
>
> - **What changed:** Fixed a visual alignment issue in the Prompt Editor where the highlighted variable tags had extra padding and font-weight, causing the transparent typing layer to misalign with the visual layer and break cursor navigation. Positioned the autocomplete dropdown dynamically to float precisely below the text cursor rather than the bottom of the editor, and added an automatic trailing space when selecting a variable via autocomplete.
> - **Why:** Ensures the text cursor remains perfectly synced with the visible text, preventing navigation bugs, and provides a much more intuitive, developer-like autocomplete experience.
> - **Files:**
>   - `src/components/PromptEditor.tsx`

---

> ### Legacy ImageRefs Cleared on Load
>
> - **What changed:** Added logic to automatically strip out legacy `'1'` and `'2'` string values from the `imageRefs` array when loading saved shots from `localStorage`.
> - **Why:** The app is moving toward using direct images instead of string references. Users who had the old default constants saved in their browser were seeing orphaned "Ref 1" tiles; this cleanly drops them so the UI reflects the new state.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Bulk Edit Accepts Empty Submissions
>
> - **What changed:** Saving an empty or whitespace-only bulk edit for Globals and Shots no longer triggers an error.
> - **Why:** Clearing all shots or globals via bulk edit is a valid action, but empty JSON caused parse errors for Shots, and we wanted to ensure empty Globals saved properly. Now empty strings are caught and cleanly parsed as an empty array before attempting JSON parse.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### 💅 UI Improvements

---

> ### Copy & Clear Buttons for Bulk Edit
>
> - **What changed:** Added "Copy" and "Clear" buttons to the bulk edit textareas for both Globals and Shots, mirroring the functionality provided for individual shot prompts. The Copy button copies the entire bulk text to the clipboard and shows a brief success animation, while the Clear button instantly empties the textarea. Additionally, the "Save Bulk Edit" button for Globals was moved from the top header down to the bottom row alongside the "Cancel" button, perfectly aligning its layout with the Shots Bulk Edit interface.
> - **Why:** Improves workflow efficiency when managing large scripts or variable sets, making it easier to duplicate or wipe bulk content without manual text selection on desktop and mobile. Moving the Save button creates a consistent, predictable user experience across all bulk edit modes.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Clear Button for Shot Prompts
>
> - **What changed:** Added a "Clear" button next to the Prompt label in each shot's detail view. Clicking it instantly empties the prompt textarea. Additionally, added a "Copy" button next to it that copies the current prompt text to the clipboard and shows a green tick animation for 2 seconds. Both buttons also have active click scaling and background darkening states.
> - **Why:** Makes it much easier to wipe the text area on mobile devices where selecting all text manually can be tedious, allowing users to quickly paste new prompts. The copy button allows for easy duplication of prompts, and the active styling gives immediate physical click feedback.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Default Shots Constants Cleaned
>
> - **What changed:** Removed all pre-filled `imageRefs` (e.g. `['1']` or `['2']`) from the default `PODCAST_SHOTS` constants.
> - **Why:** Prevents non-existent image references from showing up by default when loading initial boilerplate or adding new shots.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### 💅 UI Improvements

---

> ### Mobile Generated Media Scroll
>
> - **What changed:** When generating a video on mobile devices (viewport width < 1024px), the screen now automatically scrolls down to the "Generated Media" section once the generation succeeds.
> - **Why:** Prevents the user from having to manually scroll down to find their newly generated video, improving the mobile UX.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Mobile Avatar Generation Scroll
>
> - **What changed:** When generating an avatar on mobile devices (viewport width < 768px), the screen now automatically scrolls smoothly down to the image preview container once the generation is complete and the image appears.
> - **Why:** In the mobile single-column layout, the generated image appears far below the generation button. Users previously had to manually scroll down to see the result, which felt disconnected. Auto-scrolling immediately reveals the success state.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

### ✨ Features

---

> ### Shot Prompts Global Variables Support
>
> - **What changed:** Added a custom `PromptEditor` component for referencing global variables inside shot prompts using `{variableName}` syntax. Variables are formatted in real-time as bold text with a violet halo while typing. Typing `{` triggers an autocomplete dropdown of available global variables with keyboard navigation support. Detected variables are also displayed below the prompt as hoverable pill tags showing a preview of their value. During video generation, these variables are automatically replaced with their respective values before sending to the backend API.
> - **Why:** Allows users to reuse repetitive text, like character descriptions or stylistic instructions, across multiple shots. Real-time visual formatting and autocomplete make typing complex variables intuitive and error-free without leaving the keyboard.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/components/PromptEditor.tsx`

---

> ### Image Library Multi-Select Modal & Media Deletion
>
> - **What changed:**
>   1. Selecting "Image Library" when attaching an image to a shot now opens a dedicated popup modal instead of just expanding the right sidebar. This modal allows multi-selecting images to attach all at once, while enforcing the 3-image limit.
>   2. Images in the global Image Library can now be deleted via an '×' button, which prompts a confirmation dialog. Deleting an image also removes it from any shots it was attached to.
>   3. Generated videos in the global Generated Media list can now be deleted, also prompting a confirmation dialog before removal.
> - **Why:** Improves workflow speed by allowing bulk attachment of library images directly from the shot card. Adds necessary media management features so users can clean up their workspace and remove unwanted files safely.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Mobile-Friendly Image Removal & Limit
>
> - **What changed:** The 'remove' (`×`) button on attached images in a shot is now constantly visible with a dark backdrop (instead of requiring hover), and a strict limit of 3 images per shot has been enforced. When the limit is reached, the "Upload" button is hidden.
> - **Why:** Hover-only actions are inaccessible on touch devices, making it impossible for mobile users to delete attachments. Enforcing a 3-image limit ensures stable performance and adherence to backend API constraints.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Shots Bulk Edit
>
> - **What changed:** Added a "Bulk Edit" feature for the Shots section, allowing users to view and edit all shots as a single JSON array in a large textarea. It validates the JSON on save, drops unknown keys, and warns on invalid syntax.
> - **Why:** Makes it much easier for power users to copy/paste entire scripts or make large sweeping changes to multiple shots at once without clicking through each accordion.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Camera Flow with Live Viewfinder and Accept/Reject Preview
>
> - **What changed:** Tapping Camera on mobile now opens a full-screen web camera overlay (via `getUserMedia`) instead of delegating to the native input capture. A large shutter button captures the frame. The user is then shown the still preview with **Retake** and **Use Photo** buttons — accepting converts the canvas frame to a `File` and calls `onUpload`, rejecting restarts the live stream. The overlay is rendered via a React portal into `document.body` so it sits above all stacking contexts.
> - **Why:** Native `input capture` hands control to the OS camera app with no in-app preview step. The web camera approach keeps the accept/reject flow inside the product.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`

---

> ### Gallery and File Options Open Correct OS Pickers on Mobile
>
> - **What changed:** Gallery now uses `input.accept = "image/*"` without a `capture` attribute — on iOS and Android this opens the photo gallery picker directly. File now uses `input.accept = "*/*"` — this opens the OS file browser (Files app on iOS, file manager on Android). Both support multi-select.
> - **Why:** Previously both options shared the same generic file input with no differentiation, so they behaved identically and neither specifically targeted the gallery or file browser.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`

---

### 💅 UI Improvements

---

> ### DeviceAwareUpload — Simplified to Native Picker with Image Library Option
>
> - **What changed:** Removed all custom mobile UI (bottom sheet, camera overlay, getUserMedia flow, gallery/file differentiation). Replaced with a single hidden `<input type="file" accept="image/*" multiple>` that the OS handles natively. When `hasLibraryImages` is false, clicking upload goes straight to the native picker. When `hasLibraryImages` is true, a small portal menu appears with two options: **Image Library** and **Upload Images**. The menu is positioned via `getBoundingClientRect` and rendered into `document.body` so `overflow: hidden` ancestors cannot clip it. Outside-click detection uses `click` (not `mousedown`) so button handlers always fire before dismissal.
> - **Why:** The previous custom MobileMenu was broken — `mousedown` outside-click fired before button click events, unmounting the portal before handlers ran. The desktop dropdown was clipped by `overflow: hidden` ancestors in the script page. Delegating to the OS native picker fixes both issues with zero custom UI needed.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`

---

> ### Avatar Page — Two-Column Desktop Layout
>
> - **What changed:** On desktop (≥768px) the Create Your Avatar page now renders in two columns — form on the left (`flex: 1`), image preview on the right (`w-[400px]`, `flex-shrink: 0`, `sticky top-6`). The page title sits above both columns as a full-width header so the form card and preview box are top-aligned. On mobile (<768px) the layout stays single-column and unchanged. The right column shows a placeholder when no image has been generated, and fills with the avatar once generated. Action buttons (Regenerate, Push to Library, Download) sit below the preview in the right column. Generate Avatar and Import stay in the left column.
> - **Why:** The original single-column layout wasted the full right half of the viewport on desktop and buried the preview below a long form.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Avatar Page — "Step 1 of 2" Pill Removed
>
> - **What changed:** Removed the "Step 1 of 2" step indicator pill from the page header. Step 2 components (topic, script, voice, pipeline) are hidden, making the step indicator misleading.
> - **Why:** Surfacing a step count when step 2 is not reachable confuses the user flow.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Update API Key Component UI in Avatar Page
>
> - **What changed:** Matched the Gemini API key component UI in the avatar page to look identical to the Veo API key component in the script page.
> - **Why:** To maintain consistent UI and UX across the application for API key inputs.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Image Library Option Hidden When Library Is Empty
>
> - **What changed:** The "Image Library" option (renamed from "Image Media") is now hidden in both the desktop dropdown and mobile bottom sheet when no images have been uploaded yet (`images.length === 0`). It reappears automatically once at least one image exists. All three `DeviceAwareUpload` usages in the script page pass `hasLibraryImages={images.length > 0}`.
> - **Why:** Showing a library picker when the library is empty is confusing and leads to a dead end.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`
>   - `src/app/script/page.tsx`

---

### 🐛 Fixes

---

> ### Mobile Overlay Z-Index — Bottom Sheet Now Covers Sticky Headers
>
> - **What changed:** The `DeviceAwareUpload` mobile bottom sheet is now rendered via `ReactDOM.createPortal` into `document.body`, completely escaping `main`'s stacking context. Previously, sticky headers (`z-20`, `z-40`) inside `main` (which has `overflow-x-hidden overflow-y-auto`) were rendering above the `fixed` overlay even at `z-[9999]` because `position: sticky` always creates its own stacking context regardless of z-index value.
> - **Why:** CSS stacking context containment — `fixed` descendants of overflow containers do not always paint at the root stacking level in all browsers. Portal sidesteps this entirely.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`

---

> ### Script Page — Mobile Layout Shows Shots First, Settings Below
>
> - **What changed:** Removed `h-full` from the root container on mobile (now `lg:h-full`) so both panels can render their full content height and the page scrolls naturally via `main`'s existing `overflow-y-auto`. Removed `order-first` from the right (Settings) panel so the Shots/Script panel appears first on mobile in DOM order.
> - **Why:** `h-full flex-col` on mobile constrained total height to the viewport. The right panel's `order-first` consumed all visible space, leaving the Shots panel below the fold with no way to reach it.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Script Page — `overflow-hidden` Clipping Shot Cards Removed
>
> - **What changed:** Removed `overflow-hidden` from the shots container div. Added `z-20` to the sticky page title so it stays above expanded shot cards (`z-10`) while scrolling.
> - **Why:** `overflow-hidden` on a parent clips `overflow-visible` children, causing expanded shot accordion cards to be cut off at the container boundary.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### VS Code — Suppress `@theme` Unknown At-Rule Warning
>
> - **What changed:** Created `.vscode/settings.json` with `"css.lint.unknownAtRules": "ignore"`.
> - **Why:** Tailwind CSS v4 uses the `@theme` directive which the VS Code built-in CSS language server does not recognise, producing a spurious warning on `globals.css`.
> - **Files:**
>   - `.vscode/settings.json`

---

### 🐛 Fixes

---

> ### Video Script Editor — Accordion Layout Fix
>
> - **What changed:** Fixed the Shots Accordion layout in the Script Editor by making the parent container `relative`, ensuring the left pane is a `block`, and adding `order-first lg:order-last` to ensure the layout functions properly on mobile and desktop without hiding elements.
> - **Why:** The Shots Accordion was hidden/clipped because the layout styling was broken, particularly on responsive screens.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Video Script Editor — Desktop Layout and Overflow Fixes
>
> - **What changed:** Fixed the main content column width by ensuring the layout `main` uses `min-w-0 overflow-x-hidden`. Updated `DeviceAwareUpload` dropdown to use `max-w-[100vw] sm:max-w-xs z-50`. Added `pr-6` to the right pane to ensure padding. Used `break-words` and `box-border` for textarea and DURATION selector rows to prevent right-edge clipping.
> - **Why:** On desktop, the main content area was overflowing to the right, causing the PROMPT textarea, DURATION selector row, and upload dropdowns to clip at the screen boundary.
> - **Files:**
>   - `src/app/layout.tsx`
>   - `src/app/script/page.tsx`
>   - `src/components/DeviceAwareUpload.tsx`

---

### ✨ Features

---

> ### Device-Aware Upload Experience
>
> - **What changed:** Implemented a reusable `DeviceAwareUpload` component that detects screen width dynamically. On desktop, it renders a popover dropdown under the trigger button (Image Media, Local Directory). On mobile, it displays a native-feeling bottom sheet with an overlay (Image Media, Gallery, File, Camera). Integrated into the Image Library and shot card attachments.
> - **Why:** Provides a tailored, native-like upload experience on mobile devices while keeping a compact dropdown approach on desktop viewports.
> - **Files:**
>   - `src/components/DeviceAwareUpload.tsx`
>   - `src/app/avatar/new/page.tsx`
>   - `src/app/script/page.tsx`

---

### 💅 Styling and UI Improvements

---

> ### Consistent Custom Confirm Popups
>
> - **What changed:** Replaced all native browser `window.confirm` dialogs with a custom, theme-consistent `ConfirmPopup` component across the application (deleting shots, clearing variables, and deleting projects).
> - **Why:** The native browser popups felt disjointed and interrupted the app's clean UI design. The custom modal perfectly matches the light theme, complete with backdrop blur, rounded corners, and consistent action buttons.
> - **Files:**
>   - `src/components/ConfirmPopup.tsx`
>   - `src/app/script/page.tsx`
>   - `src/app/video-maker/_components/ProjectsPanel.tsx`

---

> ### Video Script Editor — Visual Polish and Whitespace Reductions
>
> - **What changed:** Defined a reusable `.field-label` CSS class for all section labels to ensure consistent typography (font weight, letter spacing, size, and color). Reduced the vertical padding in the Globals variable list and added a subtle 1px divider line between rows, cutting the section's total height by ~40%.
> - **Why:** Inconsistent label styles made the UI look unpolished. The Globals list previously required too much scrolling due to excessive padding per variable row.
> - **Files:**
>   - `src/app/globals.css`
>   - `src/app/script/page.tsx`
>
> ---
>
> ### Video Script Editor — Generation Settings and Media Fixes
>
> - **What changed:** Wrapped the API Key inputs into a collapsible "⚙️ API Settings" accordion, removed the Gemini API Key field completely, updated generated video thumbnails to use `object-cover` instead of `object-contain` to fix letterboxing, and added a clearer empty state to the Image Library with a camera icon and a direct "+ Upload your first image" button.
> - **Why:** The API Key inputs were unnecessarily taking up prime real estate. The video thumbnails were rendering with large black bars. The empty state for the Image Library was confusing and lacked a clear call-to-action.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Video Script Editor — Shot Card UI Improvements
>
> - **What changed:** Enhanced the UI of Shot Cards, making collapsed shots show a prompt preview, changing the expand icon to a chevron, adding visual hierarchy (background and shadow) to the expanded state, and replacing the duration/resolution select dropdowns with touch-friendly pill button toggles.
> - **Why:** Improves touch-friendliness on mobile, visual distinction between states, and provides context for collapsed shots.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Create Avatar Page — Layout and API Key UI
>
> - **What changed:** Switched the Create Avatar page to a single-column layout, moving the avatar image preview directly beneath the generation box. Hid the step 2 video/pipeline settings. Added a Gemini API Key input popup with validation state above the avatar description, and a new "Push to Image Library" button alongside the Download button.
> - **Why:** Streamlines the avatar generation flow and makes providing the API key explicit and mandatory before generating images. The single-column layout provides a more focused user experience.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

### 🐛 Fixes

---

> ### Video Script Editor — UI Layout and Truncation Fixes
>
> - **What changed:** Fixed horizontal overflow on action buttons, updated variable names and values to use a CSS grid (`minmax(110px,auto) 1fr`) to ensure values are never left-orphaned and utilize available space cleanly, stacked the Globals description text above action buttons to fix overlap, added a visual separator border under the Globals header, corrected the sidebar navigation icon alignment and active highlight style on mobile, added bottom safe-area spacing to the sidebar, aligned the page title and Select All button visually, and added bottom padding to the scrollable list. Fixed the shot list header layout using flex-nowrap and overflow hidden so that titles and duration text safely truncate instead of wrapping into a broken second row. Moved the "Add New Shot" button into a sticky container at the bottom of the list for immediate access. Added visual disabled states (opacity and cursor) to the Generate button when zero shots are selected. Added collapsible section accordions with item counts and chevron indicators for major page sections (Shots, Generation Settings, Image Library, Generated Media) to fix infinite scrolling issues. Added a sticky page header to retain context, and moved the global "Select All" button contextually into the Shots section header.
> - **Why:** The action buttons and variable names were illegible on smaller devices due to truncation and overflow, the layout felt clustered without clear separation, sidebar icons were misaligned, and the page lacked visual polish and safe-area adjustments for mobile viewports. The shot rows were breaking and overflowing on long text. The primary call-to-actions were misleading or buried out of view on smaller screens. The page lacked proper section navigation resulting in an infinite scroll, and the global Select All button was contextually ambiguous.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/components/AppSidebar.tsx`

---

> ### Video Script Editor — Add Variable Modal Mobile Fix
>
> - **What changed:** Moved the "Add Variable" modal outside of its `overflow-hidden` container to the root level. Added `max-h-[90vh]`, `overflow-y-auto`, and sticky headers/footers to the modal.
> - **Why:** The modal was being cut off and bleeding out of the frame on mobile devices without any way to scroll.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### 💅 Styling and UI Improvements

---

> ### Video Script Editor — Mobile Responsive Layout Fix
>
> - **What changed:** Fixed the mobile layout for the Script page by changing the top-level container to `flex flex-col lg:flex-row`.
> - **Why:** The layout was rendering improperly on mobile devices (squished side-by-side panes). Using `flex-col` on mobile ensures the left and right panes stack vertically as expected, improving readability and usability on smaller screens.
> - **Files:**
>   - `src/app/script/page.tsx`
>
> ---

> ### Video Script Editor — Light Theme and Grid Layouts
>
> - **What changed:**
>   - Completely redesigned the Script Editor interface from dark mode to a light theme (`bg-slate-50`, `bg-white` cards, `border-slate-200`) to perfectly match the application's left sidebar styling.
>   - Converted the "Image Library" and "Generated Media" sections from single-row horizontal scrolling to responsive grid layouts with vertical scrollbars.
>   - Added a 3-second highlight animation (glowing violet ring and scaled play button) to newly generated videos upon API success to immediately draw attention.
> - **Why:** Ensures visual consistency across the app while making it much easier to browse large amounts of media without awkward horizontal scrolling. The highlight effect provides clear visual feedback when long-running generations complete.
> - **Files:**
>   - `src/app/script/page.tsx`

---

### ✨ Features

---

> ### Video Script Editor — Generation Versioning & Stop Control
>
> - **What changed:**
>   - **Versioning:** When re-generating a video for a shot, it no longer overwrites the old file. The backend now appends a version number (e.g. `shot_1 (1).mp4`) if the file exists. The frontend tracks an array of URLs per shot and renders all generated versions simultaneously in the grid.
>   - **Stop Button:** Added a "Stop" button that appears during video generation. Clicking it instantly aborts the pending Next.js API fetch request (`AbortController`) and resets the UI loading state back to idle.
>   - **Loader Versioning:** The loading spinner text now dynamically indicates which version is being generated (e.g., "Generating Shot 1 (v2)...").
> - **Why:** Prevents accidental data loss of previously generated good takes, allowing users to compare multiple generations side-by-side. The stop button gives users immediate control to cancel long-running processes if they spot an error in their prompt.
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/app/api/script/generate-video/route.ts`

---

## 🗓️ **2026-04-04**

---

### ✨ Features

---

> ### Video Script Editor — Generation and Layout Refinements
>
> - **What changed:**
>   - **Generated Media Section**: Added a horizontally scrollable section at the bottom of the right sidebar to display generated videos alongside their shot names, including a Download button for each.
>   - **Layout Fixes**: The right sidebar is now locked to the screen's height without global scrolling. The Image Library and Generated Media sections slide horizontally (`overflow-x-auto`), maximizing vertical efficiency.
>   - **Shot Management & Persistence**: Users can now add new shots or delete existing ones. All shots, API Keys, and Model selections are persisted to `localStorage` and restored on load.
>   - **UI Polish**: Checkbox selection no longer accidentally opens the accordion. Added an inline `+` button inside each shot's "Attached Images" area for quick uploads. Added a pulsating spinner/loader inside the shot's accordion header when generating.
> - **Why:** A more intuitive layout allows users to quickly view generations without scrolling up and down the page. Storing settings locally enables a smoother, continuous workflow across sessions.
> - **Files:**
>   - `src/app/script/page.tsx`

---

> ### Video Script Editor Initial Route
>
> - **What changed:** Created a dedicated `/script` route for managing AI video script shots. Includes an accordion-based shot list with editable prompts, durations, and resolutions. Added a Generation Settings panel (with API Key and Model selection) and a persistent Image Library for attaching reference images to shots. Shots and settings are saved to `localStorage`.
> - **Why:** Provides a dedicated workspace to prepare, adjust, and configure individual shots before sending them to the video generation model (e.g. Veo).
> - **Files:**
>   - `src/app/script/page.tsx`
>   - `src/app/script/constants.ts`
>   - `src/components/AppSidebar.tsx`

---

## 🗓️ **2026-03-30**

---

### 💅 UI Improvements

---

> ### Copy-to-Clipboard Button on Avatar Image
>
> - **What changed:** A frosted-glass icon button is now overlaid on the top-right corner of the avatar image. Clicking it copies the image as a PNG to the system clipboard using `navigator.clipboard.write()` with a `ClipboardItem`. The icon switches to a green checkmark for 2 seconds then reverts to the copy icon. The standalone Copy button that was previously in the button row below the image is removed.
> - **Why:** Lets users copy the avatar directly into other apps (Figma, Notion, chat, etc.) without having to download and re-import.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

## 🗓️ **2026-03-28**

---

### ✨ Features

---

> ### Reference Image Upload Limit Raised to 10
>
> - **What changed:** Users can now upload up to 10 reference images (previously capped at 3). All guards, state setters, and UI labels updated consistently.
> - **Why:** More reference images give Gemini better likeness signal, especially for subjects with varied angles, lighting, or expressions.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

### 💅 UI Improvements

---

> ### Avatar Image Container Adapts to Natural Image Dimensions
>
> - **What changed:** The avatar preview container no longer forces a fixed `3/4` portrait aspect ratio when an image is loaded. On `onLoad`, the container switches to the image's `naturalWidth / naturalHeight` ratio, and `object-cover` is replaced with `object-contain` so the full image is always visible without cropping. The placeholder state still uses the `3/4` ratio. Aspect ratio and visibility state are reset on each new generation.
> - **Why:** Generated images can be square, landscape, or any other ratio. Forcing `3/4` was cropping wide images and leaving dead whitespace around square ones.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

## 🗓️ **2026-03-25**

---

### ✨ Features

---

> ### Simplify Audio Controls — Volume Only (Remove Pitch & Tone)
>
> - **What changed:**
>   - Removed `pitch` and `tone` fields from the `Clip` type entirely.
>   - Removed the Pitch and Tone drag-bar controls from the clip settings popup. The popup now shows only **Tempo** and **Volume**.
>   - Removed all Web Audio API code (AudioContext, MediaElementAudioSourceNode, BiquadFilterNode) from `AudioTrackPlayer` in Preview.tsx. Audio now plays through the HTML5 `<audio>` element directly with `audio.volume = clip.volume / 100`.
>   - Volume range changed from `0–1` to `0–100`. The bar shows `{value}%` and double-clicking it resets to 100.
>   - Export route updated: removed `audioProcessingFilters()` (pitch+tone EQ); volume filter now uses `clip.volume / 100`. Video stream is copied without re-encoding when speed == 1 (preserves quality). When re-encoding is required (speed != 1), uses CRF 18 + 192 kbps AAC for high quality output.
>   - `atempo` filter is now skipped when speed == 1.0, and correctly chains two filters for sub-0.5 speeds (e.g., `atempo=0.5,atempo=0.5` for 0.25×).
> - **Why:** Pitch and tone controls used Web Audio API routing that was unreliable across browsers and added latency in preview. Removing them makes audio playback simpler and more reliable. Volume-only is sufficient for the current use case.
> - **Files:**
>   - `src/app/video-maker/types.ts` — removed `pitch` and `tone` from `Clip`
>   - `src/app/video-maker/store.tsx` — removed `SET_CLIP_PITCH`, `SET_CLIP_TONE`, `SET_CLIP_PITCH_PREVIEW`, `SET_CLIP_TONE_PREVIEW` actions and reducer cases
>   - `src/app/video-maker/_components/Timeline.tsx` — clip default volume `1` → `100`, removed `pitch`/`tone` defaults
>   - `src/app/video-maker/_components/ClipBlock.tsx` — removed Pitch/Tone bars and badges; Volume bar range 0–100; volume drag range updated; waveform/opacity scaled by `volume / 100`; double-click volume bar resets to 100
>   - `src/app/video-maker/_components/Preview.tsx` — removed Web Audio graph entirely; simplified `AudioTrackPlayer` to direct `<audio>` element with `volume = clip.volume / 100`
>   - `src/app/api/video-maker/export/route.ts` — removed pitch/tone from `ExportClip`; volume filter uses `clip.volume / 100`; video copied at speed==1; CRF 18 + 192k AAC when re-encoding; `atempoChain()` helper for safe atempo chaining

---

> ### Advanced Audio Processing Engine for Next.js
>
> - **What changed:** Implemented a new advanced audio processing engine using the Web Audio API. This features an AudioWorklet `PitchShiftProcessor` for granular pitch shifting without tempo alteration, and a `useAudioProcessor` hook managing Biquad filters for tone control (Nasal and Throaty formants).
> - **Why:** To support high-fidelity, real-time voice manipulation (pitch and tone independent of speed) directly in the browser, overcoming the standard `playbackRate` limitations and meeting the strict latency and quality constraints.
> - **Files:**
>   - `public/audio-processor.js`
>   - `src/hooks/useAudioProcessor.ts`

---

> ### Auto-Create Audio Track on Video Drop
>
> - **What changed:** When dropping a video clip onto the timeline, if no unmuted audio track exists, a new audio track is now automatically created to hold the extracted audio clip.
> - **Why:** Previously, if a user dragged a video clip and there were no audio tracks (e.g., they deleted the default one), the audio portion was silently discarded. Now it safely creates a destination track for the extracted audio.
> - **Files:**
>   - `src/app/video-maker/store.tsx`

---

> ### Knob Popup Panel — Portal-Based, Pointer-Capture Drag, Undo/Redo
>
> - **What changed:**
>   - Knobs (Tempo, Pitch, Tone) now open as a **floating popup panel** anchored above the clip, rendered via `createPortal` into `document.body`. This means they are never clipped by `overflow-hidden` containers — they always float freely over the UI.
>   - Each knob uses **pointer capture** (`setPointerCapture` / `releasePointerCapture`) on pointer-down, so dragging works reliably even when the mouse leaves the knob or the clip area entirely.
>   - The popup also includes a **Volume bar** (drag up/down) so all four clip audio parameters are accessible in one place.
>   - **Undo/redo support**: A `SNAPSHOT_FOR_UNDO` action is dispatched once at the start of each drag gesture, pushing the pre-drag state to history. All live-drag updates use new `*_PREVIEW` action variants (`SET_CLIP_VOLUME_PREVIEW`, `SET_CLIP_SPEED_PREVIEW`, `SET_CLIP_PITCH_PREVIEW`, `SET_CLIP_TONE_PREVIEW`) that update state without pushing to the undo stack. Result: `Cmd+Z` / `Cmd+Shift+Z` undoes or redoes the entire gesture as a single step.
>   - Popup opens on clip hover (when clip is ≥ 48 px wide) and stays open when the mouse moves into the popup itself (150 ms close delay).
> - **Why:** Knobs inside `overflow-hidden` clips were being clipped and were uninteractable because `window.addEventListener` mouse events are unreliable once the pointer leaves the element. The portal + pointer-capture approach makes them fully reliable. Undo/redo was added so users can freely experiment without fear of losing their previous settings.
> - **Files:**
>   - `src/app/video-maker/store.tsx` — `SNAPSHOT_FOR_UNDO` action; `patchClipsNoHistory` helper; four `*_PREVIEW` action variants
>   - `src/app/video-maker/_components/ClipBlock.tsx` — full rewrite: `createPortal` popup, pointer-capture knob drag, snapshot-on-drag-start pattern, volume bar in popup

---

> ### Video Clip Split Display — Top Half Frames, Bottom Half Waveform
>
> - **What changed:** Video clips on the timeline now display in two vertical halves: the **top 50%** shows the thumbnail frame strip (repeating preview frames), and the **bottom 50%** shows the audio waveform extracted from the video file. A subtle divider line separates the two sections.
> - **Why:** Users requested the ability to see and interact with the audio waveform inside video clips directly on the timeline, enabling visual volume drag by feel. Having the frame strip alongside the waveform also makes it clearer which visual content corresponds to which audio.
> - **Files:**
>   - `src/app/video-maker/_components/MediaPanel.tsx` — waveform is now extracted from video files too (not just audio), using `AudioContext.decodeAudioData` on the video blob
>   - `src/app/video-maker/_components/ClipBlock.tsx` — video clips render top-half thumbnail + bottom-half waveform; shared `renderWaveform` helper

---

### 🐛 Bug Fixes

---

> ### Fix: Video Fast-Forwards Without Sound on Play
>
> - **What changed:** Removed the on-mount Web Audio graph setup for the `<video>` element. The video's Web Audio graph (for pitch/tone) is now built **lazily on the first play click**, after `Tone.start()` has resumed the AudioContext.
> - **Why:** Connecting a `<video>` element to `createMediaElementSource` on component mount captures its audio stream into the Web Audio graph immediately. Since browsers suspend the AudioContext until a user gesture (autoplay policy), the video's audio was silently dropped into a non-running graph. In some browsers this also caused `currentTime` to behave erratically, making the seek-drift correction fire repeatedly and producing a fast-forward effect. Building the graph only after `Tone.start()` has confirmed the context is running eliminates both the silence and the jitter.
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

> ### Fix: Volume Not Applied to Video Clips in Preview
>
> - **What changed:** Added `video.volume = clip.volume ?? 1` to the video sync effect that fires on every playhead update.
> - **Why:** The `<video>` element's native volume was never set from `clip.volume`, so dragging a video clip's volume had no audible effect during preview (though it was correctly applied at export via FFmpeg).
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

> ### Fix: Pitch & Tone Not Affecting Video Clip Audio in Preview
>
> - **What changed:** Added a Web Audio processing graph (PitchShift + two-band EQ) for the `<video>` element, mirroring what `AudioTrackPlayer` does for audio tracks. The graph is built lazily on first play. A separate effect updates pitch routing and EQ gain values whenever the active video clip changes.
> - **Why:** The existing pitch/tone Web Audio graph only applied to `<audio>` elements (audio tracks). Video clips played through the `<video>` element which had no graph, so pitch and tone knob changes had no audible effect in preview even though they were correctly exported.
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

### 💅 UI Improvements

---

> ### Scaled Up UI — Larger Tracks, Sidebar, Controls
>
> - **What changed:**
>   - Track height: 56 px → 72 px; track header width: 160 px → 176 px
>   - Sidebar width: `w-72` (288 px) → `w-80` (320 px)
>   - Header bar: larger padding, `text-base` title, bigger logo icon (`h-8 w-8`)
>   - Timeline ruler: `h-6` → `h-8`; time labels `text-[9px]` → `text-[11px]`; toolbar buttons and zoom controls increased to `text-sm`
>   - Seek bar: `h-2` → `h-3`; time displays `text-xs` → `text-sm`
>   - Play/pause button: `h-10 w-10` → `h-12 w-12`; icons `h-4 w-4` → `h-5 w-5`
>   - Export button: larger padding and `text-sm` font
>   - Media panel: video thumbnails `h-28` → `h-36`; audio thumbnails `h-14` → `h-20`; item name `text-[11px]` → `text-xs`
>   - Clip block label: `text-[10px]` → `text-xs`; track header icons `h-3.5` → `h-4`
> - **Why:** The editor felt too zoomed-out at typical screen sizes, making clips, controls, and text hard to target and read.
> - **Files:**
>   - `src/app/video-maker/page.tsx`
>   - `src/app/video-maker/_components/Timeline.tsx`
>   - `src/app/video-maker/_components/TrackRow.tsx`
>   - `src/app/video-maker/_components/ClipBlock.tsx`
>   - `src/app/video-maker/_components/Preview.tsx`
>   - `src/app/video-maker/_components/MediaPanel.tsx`

---

## 🗓️ **2026-03-24**

---

### ✨ Features

---

> ### Per-Clip Volume Drag, Pitch, Tempo & Tone Knobs
>
> - **What changed:**
>   - **Volume drag**: Dragging a clip body vertically (up = louder, down = quieter) now adjusts clip volume in real time. Waveform bar heights and clip opacity scale proportionally as visual feedback. Works on both video and audio clips.
>   - **Hover knobs**: Three rotary knobs appear on any clip wider than 72 px when hovered. Drag up to increase, down to decrease.
>     - **Tempo** (0.25×–2×) — real-time via `audio.playbackRate`, also applied at export.
>     - **Pitch** (±12 semitones) — real-time via Tone.js `PitchShift` (phase vocoder); PitchShift node is bypassed entirely when pitch = 0 to avoid adding latency.
>     - **Tone** (−1 warm/throaty → +1 bright/nasal) — real-time via two Web Audio API `BiquadFilter` peaking EQ nodes (200 Hz and 3 kHz), zero latency.
>   - Non-zero pitch / tone values show compact badges on the clip so they remain visible when not hovering.
>   - All four values are included in the export manifest and applied in FFmpeg: `asetrate`+`atempo` for pitch, `equalizer` filters for tone.
> - **Why:** Gives users direct, in-place control over clip audio character without leaving the timeline. Pitch and tone are particularly useful for matching voice clips recorded in different environments.
> - **Files:**
>   - `src/app/video-maker/types.ts` — added `pitch: number` and `tone: number` to `Clip`
>   - `src/app/video-maker/store.tsx` — `SET_CLIP_PITCH`, `SET_CLIP_TONE` actions; `ADD_CLIP` defaults both to 0 for backward compat
>   - `src/app/video-maker/_components/ClipBlock.tsx` — direction-detecting drag (vertical = volume, horizontal = move), `Knob` component, hover overlay, pitch/tone badges
>   - `src/app/video-maker/_components/Timeline.tsx` — new clip literal includes `pitch: 0, tone: 0`
>   - `src/app/video-maker/_components/Preview.tsx` — `AudioTrackPlayer` builds a Web Audio graph (MediaElementSource → PitchShift → EqLow → EqHigh → destination); pitch routing is switched in/out dynamically; Tone.js context started lazily on first play
>   - `src/app/api/video-maker/export/route.ts` — `audioProcessingFilters()` helper applies `asetrate`+`atempo` for pitch and dual `equalizer` for tone in the FFmpeg filter chain

---

> ### Dual Playhead System — White Play Head & Violet Edit Cursor
>
> - **What changed:** Replaced the single playhead with two independent cursors. The **white head** (play position) is set only by clicking on the ruler or tracks and advances during playback — it determines where play starts from. The **violet head** (edit cursor) follows the mouse at all times, including during playback, and is used exclusively for editing operations (split, paste, delete, keyboard shortcuts). Both heads are rendered as lines through the full track area with matching diamond markers on the ruler.
> - **Why:** Previously, hovering the timeline during playback was blocked, and there was no way to position the edit point independently from the play position. Separating the two allows users to set up split/paste operations while audio/video is still running.
> - **Files:**
>   - `src/app/video-maker/store.tsx` — added `editCursor` state field and `SET_EDIT_CURSOR` action
>   - `src/app/video-maker/_components/Timeline.tsx` — ruler hover → `SET_EDIT_CURSOR`, ruler click/drag → `SET_PLAYHEAD`; all keyboard shortcuts and paste now use `editCursor`
>   - `src/app/video-maker/_components/ClipBlock.tsx` — split button uses `editCursor` instead of `playhead`

---

> ### Fix: Timeline Drop Position Misalignment at Any Zoom Level
>
> - **What changed:** Replaced the drop-position calculation in `TrackRow` from `e.currentTarget.getBoundingClientRect().left + HEADER_W` to measuring directly from the clip area element's own bounding rect via a `clipAreaRef`.
> - **Why:** The old calculation subtracted a hard-coded `HEADER_W` constant from the full row's rect, which could drift from the actual rendered header width due to borders or scroll offsets, causing clips to land 1–2 seconds off from where they were dropped. Measuring from the clip area element directly eliminates all such offsets regardless of zoom or scroll position.
> - **Files:**
>   - `src/app/video-maker/_components/TrackRow.tsx`

---

> ### Fix: Audio Waveform Shows Correct Segment After Split
>
> - **What changed:** Audio clip waveforms now display only the samples corresponding to the clip's `trimStart`/`trimEnd` range. The SVG `viewBox` is updated to match the sliced sample count so the waveform stretches correctly across the trimmed width.
> - **Why:** After splitting a clip, both halves referenced the same full 120-sample waveform array. Since the SVG used `preserveAspectRatio="none"`, the full waveform was squashed into each shorter clip, making it appear as if the same wave pattern repeated at each second.
> - **Files:**
>   - `src/app/video-maker/_components/ClipBlock.tsx`

---

> ### Fix: Audio Glitch & Repeated Segment at Split Point During Playback
>
> - **What changed:** Rewrote `AudioTrackPlayer` in `Preview.tsx` to stop re-seeking the audio element on every RAF frame. The audio now plays natively between same-source clip transitions; a seek is only issued when the source file changes, when transitioning to a different clip with significant drift (> 0.15 s), or when scrubbing while paused.
> - **Why:** The previous implementation dispatched a corrective seek on every playhead update (~60 fps). At split points, the audio was already at the correct position but was being seeked back to `trimStart`, causing a brief stutter/repeat of the audio at exactly the split moment. Removing the continuous drift-correction seek eliminates both glitches.
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

> ### Advanced Video Editor Keyboard Shortcuts & Undo/Redo
>
> - **What changed:**
>   - Added global `Cmd/Ctrl + Z` for Undo and `Cmd/Ctrl + Shift + Z` for Redo.
>   - Added `Cmd/Ctrl + C` / `V` to copy/paste the hovered or selected clip (pasting at the current playhead position on the hovered track).
>   - Modified `s`, `m`, and `Delete`/`Backspace` to act on the currently hovered clip under the pointer line instead of only working on the selected clip.
> - **Why:** Essential professional video editing functionality and speed improvements for creators.
> - **Files:**
>   - `src/app/video-maker/store.tsx`
>   - `src/app/video-maker/page.tsx`
>   - `src/app/video-maker/_components/Timeline.tsx`
>   - `src/app/video-maker/_components/ClipBlock.tsx`

---

### 🐛 Fixes

---

> ### Video Preview Playback & Clip Transition Fix
>
> - **What changed:** Fixed an issue where the video preview would freeze or go black during playback, and added multi-track audio playback support.
> - **Why:** The playback loop was occasionally causing a "seek death spiral" due to minor syncing drifts, and newly loaded clips weren't automatically resuming play when transitioning across splits or gaps in the timeline. Audio tracks are now fully mixed and played back in real-time alongside video.
> - **Files:**
>   - `src/app/video-maker/_components/Preview.tsx`

---

> ### Prevent Accidental Playhead Scrubbing on Timeline Hover
>
> - **What changed:** Fixed an issue where simply moving the mouse over the track rows would unintentionally scrub the playhead.
> - **Why:** Prevented keyboard shortcuts (like 's' to split) from working correctly at the paused location, as hovering moved the playhead away from the track head line.
> - **Files:**
>   - `src/app/video-maker/_components/Timeline.tsx`

---

> ### Seamless Hover Scrubbing & Preview Buffering
>
> - **What changed:**
>   - Playhead now automatically tracks mouse movement on hover over the tracks in `Timeline.tsx`.
>   - Modified `Preview.tsx` to instantly buffer and update the video frame when scrubbing while paused.
>   - Media deletion now correctly cleans up associated clips on all tracks.
> - **Why:** Removing videos left broken clips in tracks, and the preview wouldn't update smoothly during fast hover scrubbing.
> - **Files:**
>   - `src/app/video-maker/_components/Timeline.tsx`
>   - `src/app/video-maker/_components/Preview.tsx`
>   - `src/app/video-maker/store.tsx`

---

### ✨ Features

---

> ### Video Maker — Full Timeline Editor at `/video-maker`
>
> - **What changed:** New standalone route `/video-maker` with a Canva-style video editing interface. Left sidebar has two panels — **Projects** (create, rename, delete, persist to localStorage) and **Media** (upload videos/audio, auto-extracts thumbnails and waveforms). Centre shows a live preview with play/pause and seekbar. Bottom has a scrollable timeline with time ruler, playhead scrubbing, multiple video and audio tracks, and zoom controls.
> - **Clip operations:** Drag from media panel to any track to place a clip. Drag clips to reposition. Drag left/right trim handles to trim. Click "Split" in the selected-clip toolbar to split at the playhead. Set speed (0.25×–2×) from a speed picker in the toolbar. Audio clips get a volume slider. Tracks can be muted or deleted.
> - **Export:** "Export MP4" uploads all clip media to the server via `/api/video-maker/upload`, then sends the project manifest to `/api/video-maker/export` which uses system FFmpeg to stitch clips (with trim, speed, and audio mixing via `filter_complex`) and streams back the final MP4.
> - **Persistence:** Project track/clip structure is saved to `localStorage` under `video-maker-projects`. Media files (blob URLs) are in-memory only and require re-upload on page reload.
> - **Files:**
>   - `src/app/video-maker/page.tsx` — layout, export flow, `EditorProvider` root
>   - `src/app/video-maker/types.ts` — `MediaItem`, `Clip`, `Track`, `Project`, `effectiveDuration`, `clipEndTime`
>   - `src/app/video-maker/store.ts` — `useReducer` + React context, all actions, localStorage persistence, `selectTotalDuration`
>   - `src/app/video-maker/_components/ProjectsPanel.tsx` — project list with inline rename
>   - `src/app/video-maker/_components/MediaPanel.tsx` — file upload, thumbnail extraction (canvas), waveform sampling (Web Audio API), drag-to-timeline
>   - `src/app/video-maker/_components/Preview.tsx` — `<video>` element synced to playhead, `requestAnimationFrame` playback loop
>   - `src/app/video-maker/_components/Timeline.tsx` — ruler, zoom controls, add-track buttons, drop handler, playhead line
>   - `src/app/video-maker/_components/TrackRow.tsx` — per-track header (mute/delete) and clip drop zone
>   - `src/app/video-maker/_components/ClipBlock.tsx` — positioned clip with thumbnail/waveform overlay, mouse-drag move, trim handles, selected toolbar (split/speed/volume/delete)
>   - `src/app/api/video-maker/upload/route.ts` — saves uploaded media to `storage/video-maker/[projectId]/`
>   - `src/app/api/video-maker/export/route.ts` — FFmpeg orchestration: per-clip trim+speed processing, concat, audio mixing via `amix`, streams output MP4

---

## 🗓️ **2026-03-22**

---

### ✨ Features

---

> ### Negative Prompt for Avatar Generation
>
> - **What changed:** Added an optional negative prompt field to the avatar creation page. It appears as a collapsible section below the avatar description — clicking "Negative prompt" expands a textarea styled in amber. When populated, an "active" badge appears on the toggle. The text is appended to the Gemini prompt as `Do not include: <terms>`. The value is saved/restored from the draft localStorage key.
> - **Why:** Lets users exclude specific unwanted attributes (e.g. glasses, beard, hat) without having to over-specify the positive prompt.
> - **Files:**
>   - `src/app/avatar/new/page.tsx` — collapsible negative prompt UI, draft save/restore, passed to API
>   - `src/services/gemini-image.ts` — accepts `negativePrompt?`; appends exclusion clause to the generated text prompt
>   - `src/app/api/avatar/generate/route.ts` — extracts and passes `negative_prompt` to service
>   - `src/lib/types.ts` — added `negative_prompt?` to `AvatarGenerateRequest`

---

> ### Reference Image Upload for Avatar Generation
>
> - **What changed:** Users can upload up to 3 reference photos on the avatar creation page to guide Gemini's likeness and style during generation. A reference images section is added inside the prompt card with a dashed dropzone, thumbnail previews with hover-to-remove, and a `+` tile to add more. When references are present, Gemini receives them as inline image parts alongside a modified prompt instructing it to use them as a visual guide.
> - **Why:** Text prompts alone can't reliably reproduce a specific person's appearance. Reference images give users a way to anchor the generated avatar to a real likeness.
> - **Files:**
>   - `src/app/avatar/new/page.tsx` — reference images UI (dropzone, thumbnails, remove, hidden file input)
>   - `src/services/gemini-image.ts` — accepts `referenceImages?: ReferenceImage[]`; builds multi-part content with inline image data when provided
>   - `src/app/api/avatar/generate/route.ts` — extracts and validates `reference_images` from request body, passes to service
>   - `src/lib/types.ts` — added `ReferenceImage` interface; updated `AvatarGenerateRequest` with optional `reference_images`

---

## 🗓️ **2026-03-15**

---

### ✨ Features

---

> ### Fix: avatar_prompt No Longer Required When Importing
>
> - **What changed:** Removed the hard validation on `avatar_prompt` in the pipeline create route. When the user imports their own avatar image and skips Gemini generation, `avatar_prompt` defaults to `'imported'`.
> - **Why:** The field is only stored as metadata — it has no effect on pipeline processing. Requiring it blocked the import flow entirely.
> - **Files:**
>   - `src/app/api/pipeline/create/route.ts`

---

> ### Sync.so 401 Fix — Correct Auth Header
>
> - **What changed:** Replaced `Authorization: Bearer <key>` with `x-api-key: <key>` when calling the Sync.so API.
> - **Why:** Sync.so requires the `x-api-key` header, not a Bearer token. The mismatch caused every lip sync submission to fail with HTTP 401.
> - **Files:**
>   - `src/services/syncso.ts`

---

> ### Voice Selection UI
>
> - **What changed:** Added a Voice card to the avatar creation page (Step 2). Users can choose from four preset voices (Female US, Female Indian, Male US, Male British) or paste a custom Cartesia voice ID. The selected voice is passed through `PipelineCreateRequest.voice_id` to the pipeline.
> - **Why:** The default voice didn't match all avatar personas — specifically female avatars speaking English with an Indian accent needed a different voice ID.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/lib/types.ts` — added `voice_id?` to `PipelineCreateRequest`
>   - `src/services/cartesia.ts` — accepts optional `voiceId` param, falls back to `CARTESIA_VOICE_ID` env var then hardcoded default
>   - `src/app/api/pipeline/create/route.ts` — reads and passes `voice_id` through to `generateAudio`

---

> ### AI Voice Style Extraction from Topic (Gemini → Cartesia sonic-3)
>
> - **What changed:** New `voice-style` service calls Gemini to analyse the "What is your video about?" text and return structured voice controls (`emotion`, `speed`, `volume`). These are applied to Cartesia via `generation_config`. Model upgraded from `sonic-2` to `sonic-3` (required for `generation_config` support). Voice style is stored on the job record and displayed as a violet badge on the pipeline status page.
> - **Why:** The topic field already contains tone and energy instructions (e.g. "high-energy sales ad", "calm and professional"). Routing those through Gemini into Cartesia's voice controls makes the delivery match the content intent automatically.
> - **Files:**
>   - `src/services/voice-style.ts` _(new)_
>   - `src/services/cartesia.ts` — upgraded to `sonic-3`, accepts `voiceStyle?: VoiceStyle`, applies `generation_config`
>   - `src/lib/types.ts` — added `VoiceStyleConfig` interface and `voice_style` field to `PipelineJob`
>   - `src/lib/jobs.ts` — initialises `voice_style: null` on job creation
>   - `src/app/api/pipeline/create/route.ts` — calls `extractVoiceStyle(topic)` before TTS; logs resolved style
>   - `src/app/pipeline/[id]/page.tsx` — violet badge showing emotion / speed / volume once resolved

---

> ### Manual Voice Style Override
>
> - **What changed:** Voice card extended with a Style section: toggle between **Auto (Gemini)** and **Manual**. Manual mode reveals an emotion pill selector (12 options) and range sliders for speed (0.6×–1.5×) and volume (0.5×–2.0×) with live readouts. When manual is active, Gemini analysis is skipped entirely and the user values go straight to Cartesia.
> - **Why:** Users who want precise control over delivery — e.g. "I want `enthusiastic` at 1.2× speed" — shouldn't have to rely on AI inference.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/lib/types.ts` — added `voice_style_override?` to `PipelineCreateRequest`
>   - `src/app/api/pipeline/create/route.ts` — when `voice_style_override` is present, bypasses `extractVoiceStyle`

---

> ### Project Setup & Environment Configuration
>
> - **What changed:** Installed all pipeline dependencies, created `.env` with required keys, scaffolded folder structure, and defined shared TypeScript interfaces.
> - **Why:** Establishes the foundation all pipeline tasks depend on — types, folder layout, and environment config.
> - **Files:**
>   - `package.json`, `yarn.lock`
>   - `.env`, `.gitignore`
>   - `src/lib/types.ts`
>   - _(~10 stub files in `src/lib/`, `src/services/`, `src/app/avatar/`, `src/app/pipeline/`, `src/app/api/`)_
>   - `storage/.gitkeep`

---

> ### Upstash Redis Singleton + Job Utilities
>
> - **What changed:** Implemented the Redis client singleton and four job data-access functions (`createJob`, `getJob`, `updateJob`, `getAvatarBase64`).
> - **Why:** Centralises all Redis access in one place; provides job lifecycle management and reverse lookup for Sync.so webhook callbacks.
> - **Files:**
>   - `src/lib/redis.ts`
>   - `src/lib/jobs.ts`

---

> ### Avatar Generation Service + API Route + Avatar Page (Task 3)
>
> - **What changed:** Built the Gemini image service, the `/api/avatar/generate` POST route, and the full avatar creation page at `/avatar/new`.
> - **Why:** Delivers the first user-facing feature — avatar generation with approval flow before committing to the full pipeline.
> - **Files:**
>   - `src/services/gemini-image.ts`
>   - `src/app/api/avatar/generate/route.ts`
>   - `src/app/avatar/new/page.tsx`

---

### 🔧 DevOps / Build

---

> ### Home Route Redirects to Avatar Page
>
> - **What changed:** `src/app/page.tsx` now redirects `/` to `/avatar/new`.
> - **Why:** The app's entry point is the avatar creation flow; the boilerplate placeholder page is no longer relevant.
> - **Files:**
>   - `src/app/page.tsx`

---

### 📚 Docs

---

> ### Architecture.md + README Rewritten for AI Avatar Project
>
> - **What changed:** `Architecture.md` fully rewritten to document the pipeline, Redis key patterns, service layer, API contracts, and build status. `README.md` replaced the boilerplate content with project-specific setup and overview.
> - **Why:** Documentation now reflects the actual system rather than the Next.js scaffold defaults.
> - **Files:**
>   - `Architecture.md`
>   - `README.md`

---

> ### Script Generation + TTS + Sync.so Services + Pipeline Orchestration (Task 4)
>
> - **What changed:** Implemented all three AI services and the pipeline create route that orchestrates them in sequence with fire-and-forget background execution.
> - **Why:** Wires together Gemini (script), Cartesia (TTS), and Sync.so (lip sync) into a single automated pipeline triggered after avatar approval.
> - **Files:**
>   - `src/services/gemini-script.ts`
>   - `src/services/cartesia.ts`
>   - `src/services/syncso.ts`
>   - `src/app/api/pipeline/create/route.ts`

---

> ### Webhook Handler + Pipeline Status Route + Video Serving Route (Task 5)
>
> - **What changed:** Implemented the Sync.so webhook handler, the job status polling endpoint, and the video file serving route.
> - **Why:** Completes the backend — the webhook marks jobs complete after lip sync finishes, the status route enables frontend polling, and the video route serves the final MP4.
> - **Files:**
>   - `src/app/api/webhooks/syncso/route.ts`
>   - `src/app/api/pipeline/[id]/route.ts`
>   - `src/app/api/storage/[id]/video/route.ts`

---

### 💅 Styling and UI Improvements

---

> ### Avatar Page Switched to Light Mode
>
> - **What changed:** Redesigned the avatar creation page from dark (`bg-gray-950`) to a clean light theme (`bg-slate-50`) with white cards, a frosted glass header, step badges, and refined button styles.
> - **Why:** Improved readability and visual comfort; more professional feel for a light-mode audience.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Avatar Page — Download, Regenerate & Import Buttons
>
> - **What changed:** Added a Download button (exports as PNG via canvas), a Regenerate button in the preview column, and an Import button to load an existing image from disk.
> - **Why:** Users can now save their avatar, quickly regenerate from the preview area, or skip generation entirely by importing their own image.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`

---

> ### Script Section — AI Generation Mode (Task 7)
>
> - **What changed:** Script card enhanced with Manual / Generate with AI toggle. AI mode adds inline topic input, duration pills (15s/30s/45s/60s), Generate button, success banner, and a new standalone `/api/script/generate` route. Live stats (chars · words · ~Xs) and a pipeline time estimate box added below the textarea.
> - **Why:** Users can generate a script without leaving the page, or write their own — the AI result is pre-populated and freely editable before committing to the pipeline.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/services/gemini-script.ts` — added `duration` parameter with per-duration word count ranges
>   - `src/app/api/script/generate/route.ts` _(new)_

---

> ### Debug Logging — Pipeline & Webhook
>
> - **What changed:** Added structured `console.log` / `console.error` / `console.warn` throughout the pipeline orchestration route and Sync.so webhook handler covering every stage transition, file save, API call, and failure path.
> - **Why:** Makes it possible to trace the full pipeline execution and catch bugs from server logs without guesswork.
> - **Files:**
>   - `src/app/api/pipeline/create/route.ts`
>   - `src/app/api/webhooks/syncso/route.ts`

---

> ### Pipeline Status Page with Live Progress UI
>
> - **What changed:** Built the full pipeline status page at `/pipeline/[id]` — polling, animated stage tracker, progress bar, lipsync wait callout, video player on completion, and error state.
> - **Why:** Gives users live feedback while the 2–5 minute pipeline runs and reveals the final video when ready.
> - **Files:**
>   - `src/app/pipeline/[id]/page.tsx`

---

> ### Avatar Page — Topic + Script Fields & Portrait Image Container
>
> - **What changed:** Phase 2 now has two input sections — a resizable "What is your video about?" textarea and an optional "Script" textarea. Image preview container changed from square to 3:4 portrait ratio.
> - **Why:** Users can write their own script to skip AI generation; multi-line topics are now supported; portrait avatars display without cropping.
> - **Files:**
>   - `src/app/avatar/new/page.tsx`
>   - `src/lib/types.ts` — added optional `script` field to `PipelineCreateRequest`
>   - `src/app/api/pipeline/create/route.ts` — skips Gemini script generation when user provides their own script

---

### 🔧 DevOps / Build

---

> ### Rename `GOOGLE_GENERATIVE_AI_API_KEY` → `GEMINI_API_KEY`
>
> - **What changed:** Renamed the Gemini API key environment variable to `GEMINI_API_KEY` across all services, `.env_example`, and docs.
> - **Why:** Shorter and consistent with how the key is labelled in Google AI Studio.
> - **Files:**
>   - `src/services/gemini-image.ts`
>   - `src/services/gemini-script.ts`
>   - `.env_example`
>   - `README.md`, `Architecture.md`

---

## 🗓️ **2026-03-12**

---

### ✨ Features

---

> ### Setup Next.js App
>
> - **What changed:** Initialized Next.js app with Tailwind, ESLint, Husky, lint-staged, and Jest.
> - **Why:** To setup the frontend application as requested.
> - **Files:**
>   - `package.json`
>   - `eslint.config.mjs`
>   - `jest.config.ts`
>   - `src/app/page.test.tsx`
