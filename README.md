Video Specialist Renamer (VSR) v3.0
> A professional, 100% offline batch video renamer designed for media collectors. Automatically detects series names, seasons, and episode numbers from messy filenames.
> 
🎬 The Problem it Solves
Managing a large library of anime or TV shows is often a nightmare. Files from different sources come with "junk" tags like [ReleaseGroup], 1080p, x265, and random hashes.
VSR uses advanced Regular Expression (Regex) logic to strip this junk and reformat your files into clean, industry-standard patterns (like Show Name - S01E01) required by media servers like Plex, Jellyfin, and Kodi.
✨ Key Features
 * Smart Video Parser: Detects S01E01, 1x01, EP 01, and standalone numbering patterns automatically.
 * Junk Tag Purge: One-click removal of resolution, codec, group, and audio tags.
 * Glassmorphism UI: A modern, high-end dark theme designed for focus and aesthetics.
 * Privacy First: 100% client-side. Your file data never leaves your browser.
 * PWA Enabled: Fully installable on iOS, Android, and Desktop for offline use.
 * Multi-Export: Download as a ZIP, or export a Bash/Batch script to rename your original files instantly on your local hard drive.
📁 Project Structure
The app is hyper-optimized into a modular structure to ensure high performance:
/
├── index.html       # Semantic structure
├── styles.css      # Glassmorphism theme & animations
├── parser.js       # The "Brain" (Regex & Metadata extraction)
├── app.js          # The "Controller" (UI & File handling)
├── sw.js           # Service Worker (Offline caching)
├── manifest.json   # PWA Metadata
└── jszip.min.js    # Local copy of JSZip (Offline dependency)

🚀 How to Use
1. Load Files
Drag and drop your video files into the drop zone, or tap to browse. On Desktop Chrome/Edge, you can use the "Open Folder" button for direct access.
2. Configure Settings
 * Series Name: Enter the title you want for the show.
 * Smart Clean: Toggle this to automatically remove brackets [] and quality tags from the original names.
 * Auto-Detect: When on, the app tries to find the episode number inside the filename. When off, it uses sequential numbering starting from your "Start Episode #".
3. Review & Edit
Check the Preview & Edit list. If the episode numbers are off (e.g., the show started at Episode 13), use the Episode Offset field to shift all numbers at once.
4. Export
 * Download as ZIP: Best for small batches or moving files.
 * Bash/Batch Script: Best for large libraries. Run the downloaded script in your local folder to rename the actual files on your hard drive instantly.

   
⚖️ Third-Party Credits
This project utilizes the following open-source libraries:
 * JSZip: Used for generating ZIP archives in the browser. (MIT Licensed)
 * Pako: (Included within JSZip) Provides high-performance compression logic. (MIT Licensed)
📝 License
This project is licensed under the MIT License. See the LICENSE file for details.

