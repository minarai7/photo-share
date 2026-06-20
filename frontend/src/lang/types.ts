export type LanguageCode = "en" | "ja";

export type TranslationDictionary = {
  app: {
    title: string;
  };

  nav: {
    feed: string;
    createPost: string;
    profile: (username: string) => string;
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
    loginFailed: string;
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
    emailRequired: string;
    passwordRequired: string;
    invalidEmail: string;
    passwordTooShort: string;
  };

  apiErrors: {
    invalidJson: string;
    invalidKind: string;
    emptyName: string;
    aiConfigMissing: string;
    aiRequestFailed: string;
    invalidUserId: string;
    userNotFound: string;
    internalError: string;
    signupFailed: string;
    invalidCredentials: string;
    invalidPostId: string;
    postNotFound: string;
    listPostsFailed: string;
    unauthorized: string;
    createPostFailed: string;
    forbidden: string;
    invalidMultipartForm: string;
    imageRequired: string;
    fileTooLarge: string;
    invalidFileType: string;
    uploadFailed: string;
    unknown: string;
  };

  common: {
    loading: string;
    error: string;
    cancel: string;
    confirm: string;
  };
};