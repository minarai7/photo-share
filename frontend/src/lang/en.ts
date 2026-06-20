import type { TranslationDictionary } from "./types";

export const en: TranslationDictionary = {
  app: {
    title: "Photo Share",
  },

  nav: {
    feed: "Feed",
    createPost: "Create Post",
    profile: (username: string) => `${username}'s Profile`,
    login: "Login",
    logout: "Logout",
    signup: "Sign up",
  },

  auth: {
    email: "Email",
    username: "Username",
    password: "Password",
    loginTitle: "Log in",
    signupTitle: "Sign up",
    loginButton: "Log in",
    signupButton: "Sign up",
    loginFailed: "Login failed. Please try again.",
  },

  posts: {
    feedTitle: "Feed",
    createPostTitle: "Create Post",
    editPostTitle: "Edit Post",
    caption: "Caption",
    location: "Location",
    cameraBody: "Camera Body",
    lens: "Lens",
    submit: "Submit",
    save: "Save",
    delete: "Delete",
  },

  profile: {
    title: "Profile",
    myPosts: "My Posts",
    noPosts: "No posts yet.",
  },

  settings: {
    language: "Language",
    english: "English",
    japanese: "Japanese",
  },

  validation: {
    emailRequired: "Email is required.",
    passwordRequired: "Password is required.",
    invalidEmail: "Please enter a valid email address.",
    passwordTooShort: "Password must be at least 8 characters.",
  },

  apiErrors: {
    invalidJson: "The request data is invalid.",
    invalidKind: "Please choose either camera or lens.",
    emptyName: "Please enter a name.",
    aiConfigMissing: "AI search is not configured yet.",
    aiRequestFailed: "Could not get AI gear suggestions. Please try again.",
    invalidUserId: "The user ID is invalid.",
    userNotFound: "User not found.",
    internalError: "Something went wrong. Please try again.",
    signupFailed: "Sign up failed. Please check your input and try again.",
    invalidCredentials: "Invalid email or password.",
    invalidPostId: "The post ID is invalid.",
    postNotFound: "Post not found.",
    listPostsFailed: "Could not load posts. Please try again.",
    unauthorized: "Please log in again.",
    createPostFailed: "Could not create the post. Please check your input and try again.",
    forbidden: "You do not have permission to do this.",
    invalidMultipartForm: "The upload form is invalid or the file is too large.",
    imageRequired: "Please select an image file.",
    fileTooLarge: "The image file is too large.",
    invalidFileType: "Only JPEG, PNG, and WebP images are allowed.",
    uploadFailed: "Could not upload the image. Please try again.",
    unknown: "Something went wrong. Please try again.",
  },

  common: {
    loading: "Loading...",
    error: "Something went wrong.",
    cancel: "Cancel",
    confirm: "Confirm",
  },
};