# Image Analysis Guide

HowSus performs a 12-point forensic analysis on uploaded images, entirely in your browser.

## The 12-Point Pipeline

### 1. EXIF Metadata Extraction
Uses the `exifr` library to extract all embedded metadata from the image file.

Key fields checked:
- **Camera Make/Model** — presence indicates an unprocessed/original photo
- **DateTimeOriginal** — when the photo was taken (vs. modified)
- **GPS Coordinates** — geolocation (raises a privacy note, validates range)
- **Software** — indicates post-processing tools used

**Score impact:**
- +10 for camera info present
- +10 for capture date present
- -20 for editing software detected
- -25 for AI generation tools detected

### 2. SHA-256 File Fingerprint
Generates a cryptographic hash of the file using the Web Crypto API.

The hash uniquely identifies the exact binary content of the file. If the file is modified even by a single bit, the hash changes completely.

**Use:** Cross-reference with known image databases (manual step).

### 3. MIME Type Sniffing
Reads the first 16 bytes ("magic bytes") of the file to determine its actual format, independent of the file extension.

**Why it matters:** Someone could rename a PNG to `.jpg` to disguise it, or vice versa. Magic bytes reveal the truth.

Detected formats: JPEG (`FFD8FF`), PNG (`89504E47`), GIF (`47494638`), WebP (`52494646`), TIFF (`4D4D002A`), BMP (`424D`)

**Score impact:** -20 for extension/type mismatch

### 4. Canvas Pixel Dimensions
Loads the image into an HTML Canvas element and reads `naturalWidth` × `naturalHeight`.

This reveals the actual rendered resolution, independent of EXIF claimed dimensions.

### 5. Color Saturation Analysis
Samples every 4th pixel in a downscaled 80×80 canvas. Converts each RGB pixel to HSL and averages the saturation channel.

**What it detects:** Over-saturated images (avg saturation > 75%) are a strong indicator of:
- AI-generated images (known to over-saturate colors)
- Heavy Instagram-style filter application
- Deliberate color manipulation

**Score impact:** -8 for over-saturation detected

### 6. Compression Ratio Analysis
Calculates `file.size / (width × height)` = bytes per pixel.

**What it detects:**
- PNG files with >4 bytes/pixel = anomalously large for format
- JPEG files with >2 bytes/pixel = anomalously large
- These anomalies can indicate hidden data embedded in the file (steganography)

**Score impact:** -10 for steganography indicator

### 7. Metadata Date Cross-Validation
Compares:
- `EXIF DateTimeOriginal` — when the camera says the photo was taken
- `File.lastModified` — when the OS says the file was last changed

**Why it matters:** If the file modification date is *before* the EXIF capture date, something is inconsistent. This pattern can indicate that EXIF metadata was injected from another file.

**Score impact:** -12 for date inconsistency >1 day

### 8. GPS Coordinate Validation
Validates that GPS latitude is in range [-90°, +90°] and longitude in range [-180°, +180°].

GPS values outside these ranges indicate metadata corruption or deliberate manipulation.

### 9. Alpha Channel Detection
Scans sampled pixels for partial transparency (alpha < 250).

**Why it matters:** Images with significant alpha channel usage may be composites or have had backgrounds removed and replaced — common in photo manipulation.

**Score impact:** -5 for alpha channel detected

### 10. Aspect Ratio Analysis
Common photographic aspect ratios: 1:1, 4:3, 16:9, 3:2, 2:3, 9:16, 16:10, 5:4.

**Why it matters:** Highly unusual aspect ratios (e.g., 0.05:1 or 15:1) can indicate heavy cropping — which may be removing context from the original image.

### 11. Steganography Indicators
Combines compression ratio analysis with file size anomaly detection.

**What it flags:** Files that are significantly larger than expected for their format and dimensions. This can indicate LSB (Least Significant Bit) steganography — hiding data within image pixel values.

### 12. Editing Software Fingerprint
Checks the EXIF `Software` field against 22 known editing tools:
- **Photo editing:** Photoshop, GIMP, Lightroom, Affinity, Pixelmator, Capture One, Darktable
- **Mobile editing:** Snapseed, Facetune, Meitu, PicsArt, Fotor, PhotoDirector
- **AI generation:** MidJourney, Stable Diffusion, DALL-E, Adobe Firefly, Imagen, OpenAI

## Limitations

The image analysis is entirely client-side and does not:
- Perform real reverse image search (requires server-side proxy)
- Use neural networks for deepfake detection
- Compare against known-manipulated image databases

These features are marked as unavailable in the **Environment Badge** in the app header.

## Privacy Note

No image data is sent to any server unless AI analysis is enabled. All forensic analysis runs in your browser.
