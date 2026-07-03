import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { createPost } from "../api/postsApi";
import { uploadImage } from "../api/uploadsApi";
import type { CreatePostRequest } from "../types/post";
import { FormField } from "../components/FormField";
import { useLanguage } from "../lang/LanguageContext";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";

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
    const selectedFile = event.target.files?.[0] ?? null;

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

      const { image_path } = await uploadImage(photo);

      const data: CreatePostRequest = {
        image_path: image_path,
        caption: caption.trim(),
      }

      if (location.trim() !== "") {
        data.location = location.trim();
      }
      if (cameraBody.trim() !== "") {
        data.camera_body = cameraBody.trim();
      }
      if (lens.trim() !== "") {
        data.lens = lens.trim();
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
          />

          <FormField
              id="lens"
              label={t.posts.lens}
              type="text"
              value={lens}
              setValue={setLens}
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t.posts.creatingPost : t.posts.createPostButton}
          </button>
        </form>
      </section>
    </main>
  )
}
