import type { TranslationDictionary } from "./types";

export const en: TranslationDictionary = {
  app: {
    title: "Photo Share",
  },

  nav: {
    feed: "Feed",
    createPost: "Create Post",
    profile: "Profile",
    login: "Log in",
    logout: "Log out",
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
  },

  posts: {
    feedTitle: "Photo Feed",
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
    required: "This field is required.",
    invalidEmail: "Please enter a valid email address.",
    passwordTooShort: "Password must be at least 8 characters.",
  },

  common: {
    loading: "Loading...",
    error: "Something went wrong.",
    cancel: "Cancel",
    confirm: "Confirm",
  },
};