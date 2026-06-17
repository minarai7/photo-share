export type LanguageCode = "en" | "ja";

export type TranslationDictionary = {
  app: {
    title: string;
  };

  nav: {
    feed: string;
    createPost: string;
    profile: string;
    login: string;
    logout: string;
    signup: string;
  };

  auth: {
    email: string;
    username: string;
    password: string;
    loginTitle: string;
    signupTitle: string;
    loginButton: string;
    signupButton: string;
  };

  posts: {
    feedTitle: string;
    createPostTitle: string;
    editPostTitle: string;
    caption: string;
    location: string;
    cameraBody: string;
    lens: string;
    submit: string;
    save: string;
    delete: string;
  };

  profile: {
    title: string;
    myPosts: string;
    noPosts: string;
  };

  settings: {
    language: string;
    english: string;
    japanese: string;
  };

  validation: {
    required: string;
    invalidEmail: string;
    passwordTooShort: string;
  };

  common: {
    loading: string;
    error: string;
    cancel: string;
    confirm: string;
  };
};