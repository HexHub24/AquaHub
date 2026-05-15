// AquaHub — Forum image upload helper
//
// Picks a file, validates, resizes in-browser to max 2000px / 90% JPEG,
// uploads to the `forum-uploads` Supabase bucket under the user's folder,
// and returns the public URL.

import { supabase } from '/lib/supabase.js';

// Tuning constants
const MAX_DIMENSION_PX = 2000;
const JPEG_QUALITY     = 0.9;
const MAX_FILE_SIZE    = 5 * 1024 * 1024;            // 5 MB pre-resize
const ALLOWED_TYPES    = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validate a File. Returns an error string or null.
 */
export function validateImageFile(file) {
  if (!file) return 'No file selected.';
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, or WebP images are allowed.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large. Max ${MAX_FILE_SIZE / (1024 * 1024)} MB.`;
  }
  return null;
}

/**
 * Resize an image File to max MAX_DIMENSION_PX on its longest side,
 * preserving aspect ratio. Returns a Promise<Blob> (JPEG, JPEG_QUALITY).
 */
export async function resizeImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not decode image.'));
    i.src = dataUrl;
  });

  // Compute target size
  let { width, height } = img;
  if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
    if (width >= height) {
      height = Math.round((height * MAX_DIMENSION_PX) / width);
      width = MAX_DIMENSION_PX;
    } else {
      width = Math.round((width * MAX_DIMENSION_PX) / height);
      height = MAX_DIMENSION_PX;
    }
  }

  // Draw and export
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not encode image.'));
        else resolve(blob);
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}

/**
 * Upload a file to the forum-uploads bucket. The caller is responsible for
 * passing a valid authenticated user id.
 *
 * Returns { url, path } on success, throws Error on failure.
 */
export async function uploadForumImage(file, userId) {
  if (!userId) throw new Error('Must be signed in to upload.');

  const err = validateImageFile(file);
  if (err) throw new Error(err);

  // Resize
  const blob = await resizeImage(file);

  // Build path: <user_id>/<random-uuid>.jpg
  const filename = `${crypto.randomUUID()}.jpg`;
  const path = `${userId}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('forum-uploads')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Upload failed.');
  }

  // The bucket is public, so we can derive the URL directly.
  const { data: urlData } = supabase.storage
    .from('forum-uploads')
    .getPublicUrl(path);

  if (!urlData?.publicUrl) {
    throw new Error('Could not get public URL.');
  }

  return { url: urlData.publicUrl, path };
}

/**
 * Convenience: trigger a file picker and upload the chosen file.
 * Returns { url, path } on success, throws on cancel or error.
 *
 * onProgress callback is called with status strings: 'reading', 'resizing',
 * 'uploading' — useful for UI feedback.
 */
export async function pickAndUploadForumImage(userId, onProgress) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ALLOWED_TYPES.join(',');
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) { reject(new Error('No file selected.')); return; }
      try {
        onProgress?.('reading');
        const err = validateImageFile(file);
        if (err) { reject(new Error(err)); return; }
        onProgress?.('resizing');
        // resizeImage and upload happen inside uploadForumImage
        const result = await uploadForumImage(file, userId);
        onProgress?.('done');
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });

    // Also resolve with cancel if the user closes the picker without picking.
    // Browsers don't fire 'change' on cancel, so we use a focus event as a
    // best-effort detector. We give it a small delay so the change event has
    // a chance to fire first if a file *was* picked.
    const onFocusBack = () => {
      window.removeEventListener('focus', onFocusBack);
      setTimeout(() => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
          reject(new Error('Cancelled.'));
        }
      }, 300);
    };
    window.addEventListener('focus', onFocusBack);

    input.click();
  });
}
