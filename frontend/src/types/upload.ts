export type UploadImageResponse = {
    image_path: string;
    // The grid thumbnail; absent when none could be made (e.g. animated WebP).
    thumbnail_path?: string | null;
    // Read from the photo's EXIF data; absent when the photo doesn't record them.
    camera_body?: string;
    lens?: string;
}
