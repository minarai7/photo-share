import type { TranslationDictionary } from "../lang";

export function getApiErrorMessage(
    code: string,
    t: TranslationDictionary
): string {
  switch (code) {
    case "invalid_json":
      return t.apiErrors.invalidJson;

    case "invalid_kind":
      return t.apiErrors.invalidKind;

    case "empty_name":
      return t.apiErrors.emptyName;

    case "ai_config_missing":
      return t.apiErrors.aiConfigMissing;

    case "ai_request_failed":
      return t.apiErrors.aiRequestFailed;

    case "invalid_user_id":
      return t.apiErrors.invalidUserId;

    case "user_not_found":
      return t.apiErrors.userNotFound;

    case "internal_error":
      return t.apiErrors.internalError;

    case "signup_failed":
      return t.apiErrors.signupFailed;

    case "invalid_credentials":
      return t.apiErrors.invalidCredentials;

    case "invalid_post_id":
      return t.apiErrors.invalidPostId;

    case "post_not_found":
      return t.apiErrors.postNotFound;

    case "list_posts_failed":
      return t.apiErrors.listPostsFailed;

    case "unauthorized":
      return t.apiErrors.unauthorized;

    case "create_post_failed":
      return t.apiErrors.createPostFailed;

    case "forbidden":
      return t.apiErrors.forbidden;

    case "invalid_multipart_form":
      return t.apiErrors.invalidMultipartForm;

    case "image_required":
      return t.apiErrors.imageRequired;

    case "file_too_large":
      return t.apiErrors.fileTooLarge;

    case "invalid_file_type":
      return t.apiErrors.invalidFileType;

    case "upload_failed":
      return t.apiErrors.uploadFailed;

    default:
      return t.apiErrors.unknown;
  }
}