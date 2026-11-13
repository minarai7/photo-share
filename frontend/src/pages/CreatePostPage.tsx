import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { createPost } from "../api/postsApi";
import { uploadImage } from "../api/uploadsApi";
import type { CreatePostRequest, PostImage } from "../types/post";
import type { UploadImageResponse } from "../types/upload";
import { FormField } from "../components/FormField";
import { useLanguage } from "../lang/useLanguage";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { MAX_IMAGES_PER_POST, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../config/upload";

type SelectedPhoto = {
  key: number;
  file: File;
  previewUrl: string;
};

type UploadProgress = { current: number; total: number };

export function CreatePostPage() {
  const { t } = useLanguage();
  const toApiErrorMessage = useApiErrorMessage();
  const navigate = useNavigate();

  // In display order; the first is the cover.
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [cameraBody, setCameraBody] = useState("");
  const [lens, setLens] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  const nextKey = useRef(0);
  // Uploads that already succeeded, so a retry after a failed create (or a
  // failed later upload) does not send the same file again.
  const uploaded = useRef(new Map<File, UploadImageResponse>());
  // Every preview URL still alive, revoked on removal and on unmount.
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    // Clear the input so choosing the same file again still fires onChange.
    event.target.value = "";
    if (chosen.length === 0) {
      return;
    }

    let nextError: string | null = null;
    let accepted = chosen.filter((file) => file.size <= MAX_UPLOAD_BYTES);
    if (accepted.length < chosen.length) {
      nextError = t.validation.photoTooLarge(MAX_UPLOAD_MB);
    }
    const room = MAX_IMAGES_PER_POST - photos.length;
    if (accepted.length > room) {
      accepted = accepted.slice(0, Math.max(room, 0));
      nextError = t.validation.tooManyPhotos(MAX_IMAGES_PER_POST);
    }
    setError(nextError);

    const added = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return { key: nextKey.current++, file, previewUrl };
    });
    setPhotos((current) => [...current, ...added]);
  }

  function removePhoto(index: number) {
    const removed = photos[index];
    URL.revokeObjectURL(removed.previewUrl);
    previewUrls.current.delete(removed.previewUrl);
    setPhotos((current) => current.filter((photo) => photo.key !== removed.key));
    setError(null);
  }

  function movePhoto(index: number, delta: -1 | 1) {
    setPhotos((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (photos.length === 0) {
      setError(t.validation.photoRequired);
      return;
    }

    try {
      setIsSubmitting(true);

      // One file at a time: the server decodes one image at a time anyway,
      // and the user sees which file failed.
      const results: UploadImageResponse[] = [];
      for (const [index, photo] of photos.entries()) {
        setProgress({ current: index + 1, total: photos.length });
        let result = uploaded.current.get(photo.file);
        if (!result) {
          result = await uploadImage(photo.file);
          uploaded.current.set(photo.file, result);
        }
        results.push(result);
      }
      setProgress(null);

      const images: PostImage[] = results.map((result) =>
        result.thumbnail_path
          ? { image_path: result.image_path, thumbnail_path: result.thumbnail_path }
          : { image_path: result.image_path },
      );

      const data: CreatePostRequest = {
        images,
        caption: caption.trim(),
      }

      if (location.trim() !== "") {
        data.location = location.trim();
      }

      // What the user typed wins; blank fields fall back to the EXIF data of
      // the first photo that records them.
      const camera = cameraBody.trim() || results.find((r) => r.camera_body)?.camera_body;
      if (camera) {
        data.camera_body = camera;
      }
      const lensName = lens.trim() || results.find((r) => r.lens)?.lens;
      if (lensName) {
        data.lens = lensName;
      }

      await createPost(data);

      navigate("/", {replace: true});
    } catch (error) {
      setError(
        toApiErrorMessage(error, {
          fallbackMessage: t.posts.createPostFailed
        })
      );
    } finally {
        setProgress(null);
        setIsSubmitting(false);
    }
  }

  const canAddMore = photos.length < MAX_IMAGES_PER_POST;

  return (
    <main className="form-page">
      <section className="form-card">
        <h1>{t.posts.createPostTitle}</h1>

        {error && <div className="form-error">{error}</div>}

        <form className="create-post-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="photo">{t.posts.photo}</label>

            {photos.length === 0 ? (
              <label className="image-upload-box" htmlFor="photo">
                <span className="image-upload-title">
                  {t.posts.choosePhoto}
                </span>
                <span className="image-upload-subtitle">
                  {t.posts.supportedImageTypes}
                </span>
                <span className="image-upload-subtitle">
                  {t.posts.maxImageSize(MAX_UPLOAD_MB)}
                </span>
                <span className="image-upload-subtitle">
                  {t.posts.maxImages(MAX_IMAGES_PER_POST)}
                </span>
              </label>
            ) : (
              <ol className="photo-picker-grid">
                {photos.map((photo, index) => (
                  <li key={photo.key} className="photo-picker-item">
                    <img
                      src={photo.previewUrl}
                      alt={t.posts.selectedPreviewAlt(index + 1)}
                      className="photo-picker-image"
                    />
                    {index === 0 && (
                      <span className="photo-picker-cover">{t.posts.coverPhoto}</span>
                    )}
                    <div className="photo-picker-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => movePhoto(index, -1)}
                        disabled={isSubmitting || index === 0}
                        aria-label={t.posts.movePhotoEarlier(index + 1)}
                        title={t.posts.movePhotoEarlier(index + 1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => movePhoto(index, 1)}
                        disabled={isSubmitting || index === photos.length - 1}
                        aria-label={t.posts.movePhotoLater(index + 1)}
                        title={t.posts.movePhotoLater(index + 1)}
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => removePhoto(index)}
                        disabled={isSubmitting}
                        aria-label={t.posts.removePhoto(index + 1)}
                        title={t.posts.removePhoto(index + 1)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
                {canAddMore && (
                  <li className="photo-picker-item">
                    <label className="photo-picker-add" htmlFor="photo">
                      <span className="image-upload-title">+ {t.posts.addMorePhotos}</span>
                      <span className="image-upload-subtitle">
                        {photos.length} / {MAX_IMAGES_PER_POST}
                      </span>
                    </label>
                  </li>
                )}
              </ol>
            )}

            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              multiple
              className="image-upload-input"
              onChange={handlePhotoChange}
              disabled={isSubmitting || !canAddMore}
            />
          </div>

          <FormField
              id="caption"
              label={t.posts.title}
              type="text"
              value={caption}
              setValue={setCaption}
          />

          <FormField
              id="location"
              label={t.posts.location}
              type="text"
              value={location}
              setValue={setLocation}
          />

          <FormField
              id="camera-body"
              label={t.posts.camera}
              type="text"
              value={cameraBody}
              setValue={setCameraBody}
              placeholder={t.posts.gearFromPhotoPlaceholder}
          />

          <FormField
              id="lens"
              label={t.posts.lens}
              type="text"
              value={lens}
              setValue={setLens}
              placeholder={t.posts.gearFromPhotoPlaceholder}
          />

          <button type="submit" disabled={isSubmitting}>
            {progress
              ? t.posts.uploadingPhotos(progress.current, progress.total)
              : isSubmitting
                ? t.posts.creatingPost
                : t.posts.createPostButton}
          </button>
        </form>
      </section>
    </main>
  )
}
