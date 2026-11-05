export type UploadImageResponse = {
    image_path: string;
    // Read from the photo's EXIF data; absent when the photo doesn't record them.
    camera_body?: string;
    lens?: string;
}
