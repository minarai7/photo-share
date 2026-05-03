import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { createPost } from "../api/postsApi";
import { uploadImage } from "../api/uploadsApi";
import type { CreatePostRequest } from "../types/post";
import { FormField } from "../components/FormField";

export function CreatePostPage() {
  const navigate = useNavigate();

  const [photo, setPhoto] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [cameraBody, setCameraBody] = useState("");
  const [lens, setLens] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;

    setPhoto(selectedFile);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!photo) {
      setError("Please select a photo.")
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
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Failed to create post.");
      }
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <main className="form-page">
      <section className="form-card">
        <h1>Create Post</h1>

        {error && <div className="form-error">{error}</div>}

        <form className="create-post-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="photo">Photo</label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
            />
          </div>

          <FormField
              id="caption"
              label="Title"
              type="text"
              value={caption}
              setValue={setCaption}
          />

          <FormField
              id="location"
              label="Location"
              type="text"
              value={location}
              setValue={setLocation}
          />

          <FormField
              id="camera-body"
              label="Camera Body"
              type="text"
              value={cameraBody}
              setValue={setCameraBody}
          />

          <FormField
              id="lens"
              label="Lens"
              type="text"
              value={lens}
              setValue={setLens}
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create post"}
          </button>
        </form>
      </section>
    </main>
  )
}
