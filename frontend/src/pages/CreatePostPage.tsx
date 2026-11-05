import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { createPost } from "../api/postsApi";
import { uploadImage } from "../api/uploadsApi";
import type { CreatePostRequest } from "../types/post";
import { FormField } from "../components/FormField";
import { useLanguage } from "../lang/useLanguage";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../config/upload";

export function CreatePostPage() {
  const { t } = useLanguage();
  const toApiErrorMessage = useApiErrorMessage();
  const navigate = useNavigate();

  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [cameraBody, setCameraBody] = useState("");
  const [lens, setLens] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    let selectedFile = event.target.files?.[0] ?? null;

    if (selectedFile && selectedFile.size > MAX_UPLOAD_BYTES) {
      setError(t.validation.photoTooLarge(MAX_UPLOAD_MB));
      event.target.value = "";
      selectedFile = null;
    } else if (selectedFile) {
      setError(null);
    }

    setPhoto(selectedFile);

    if (selectedFile) {
      setPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setPreviewUrl(null);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!photo) {
      setError(t.validation.photoRequired);
      return;
    }

    try {
      setIsSubmitting(true);

      const uploaded = await uploadImage(photo);

      const data: CreatePostRequest = {
        image_path: uploaded.image_path,
        caption: caption.trim(),
      }

      if (location.trim() !== "") {
        data.location = location.trim();
      }

      // What the user typed wins; blank fields fall back to the photo's EXIF data.
      const camera = cameraBody.trim() || uploaded.camera_body;
      if (camera) {
        data.camera_body = camera;
      }
      const lensName = lens.trim() || uploaded.lens;
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
        setIsSubmitting(false);
    }
  }

  return (
    <main className="form-page">
      <section className="form-card">
        <h1>{t.posts.createPostTitle}</h1>

        {error && <div className="form-error">{error}</div>}

        <form className="create-post-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="photo">{t.posts.photo}</label>

            <label className="image-upload-box" htmlFor="photo">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={t.posts.selectedPreviewAlt}
                  className="image-upload-preview"
                />
              ) : (
                <>
                  <span className="image-upload-title">
                    {t.posts.choosePhoto}
                  </span>
                  <span className="image-upload-subtitle">
                    {t.posts.supportedImageTypes}
                  </span>
                  <span className="image-upload-subtitle">
                    {t.posts.maxImageSize(MAX_UPLOAD_MB)}
                  </span>
                </>
              )
              }
            </label>

            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              className="image-upload-input"
              onChange={handlePhotoChange}
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
            {isSubmitting ? t.posts.creatingPost : t.posts.createPostButton}
          </button>
        </form>
      </section>
    </main>
  )
}
