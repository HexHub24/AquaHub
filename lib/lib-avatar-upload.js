// AquaHub — Avatar upload helper
//
// Pick a file → validate type/size → cover-crop to 256x256 square →
// export as JPEG 0.9 → upload to avatars/{user_id}/avatar.jpg
// (overwriting any existing one) → return a cache-busted URL.

import { supabase } from '/lib/supabase.js';

const AVATAR_SIZE = 256;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10MB before resize

export class AvatarValidationError extends Error {
  constructor(message) { super(message); this.name = 'AvatarValidationError'; }
}

/**
 * Loads a File into an HTMLImageElement.
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image could not be decoded.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File could not be read.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Cover-crop the image to a centered square, scale to AVATAR_SIZE,
 * and return a JPEG Blob.
 */
function cropAndExport(img) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');

    // Cover crop: pick the largest centered square from the source
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not encode image.'));
        else resolve(blob);
      },
      'image/jpeg',
      0.9,
    );
  });
}

/**
 * Upload an avatar for the given user. Returns the cache-busted public URL.
 */
export async function uploadAvatar(file, userId) {
  if (!file) throw new AvatarValidationError('No file selected.');
  if (!ACCEPTED.includes(file.type)) {
    throw new AvatarValidationError('Pick a JPEG, PNG, or WebP image.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AvatarValidationError('Image is too large (10MB max).');
  }

  const img = await loadImage(file);
  const blob = await cropAndExport(img);

  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  // Cache-bust so the browser reloads after an overwrite
  return `${pub.publicUrl}?v=${Date.now()}`;
}

/**
 * Remove the avatar file from storage. Caller is responsible for
 * also clearing the profile's avatar_url column.
 */
export async function deleteAvatar(userId) {
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from('avatars').remove([path]);
  // 404 (file already missing) is fine — we want the end state, not the steps
  if (error && !/not.found|404/i.test(error.message || '')) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}
