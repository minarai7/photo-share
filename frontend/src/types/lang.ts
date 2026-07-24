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
    signupFailed: string;

    loggingIn: string;
    creatingAccount: string;

    signupSuccess: string;

    alreadyHaveAccountLogin: string;
    dontHaveAccountSignup: string;

    emailPlaceholder: string;
    usernamePlaceholder: string;
    passwordPlaceholder: string;
  };

  posts: {
    feedTitle: string;
    feedSubtitle: string;
    loadingPosts: string;
    loadPostsFailed: string;
    noPosts: string;
    backToFeed: string;
    backToProfile: string;

    createPostTitle: string;
    editPostTitle: string;
    postDetailTitle: string;

    title: string;
    caption: string;
    location: string;
    camera: string;
    lens: string;
    created: string;

    photo: string;
    selectedPreviewAlt: string;
    choosePhoto: string;
    supportedImageTypes: string;
    creatingPost: string;
    createPostButton: string;
    createPostFailed: string;

    submit: string;
    save: string;
    saving: string;
    delete: string;
    deleting: string;
    edit: string;

    loadingPost: string;
    loadPostFailed: string;
    updatePostFailed: string;
    deletePostFailed: string;
    postNotFound: string;
    postIdMissing: string;
    invalidPostId: string;
    deleteConfirm: string;
    notSpecified: string;
    postImageAlt: string;
  };

  profile: {
    title: string;
    userPostsTitle: (username: string) => string;
    postCount: (count: number) => string;
    ownEmptyPostsMessage: string;
    createFirstPost: string;
    loadProfileFailed: string;
  };

  aiGear: {
    finding: string;
    findProduct: string;
    modalKicker: string;
    productSuggestions: string;
    findFailed: string;
    noReliableLinks: string;
    confidence: string;
    confidenceHigh: string;
    confidenceMedium: string;
    confidenceLow: string;
    confidenceUnknown: string;
    warning: string;
  };

  settings: {
    language: string;
    english: string;
    japanese: string;
    savingLanguage: string;
    languageSaveFailed: string;
  };

  validation: {
    usernameRequired: string;
    emailRequired: string;
    passwordRequired: string;
    passwordTooShort: string;
    photoRequired: string;
    userIdMissing: string;
    invalidUserId: string;
  };

  notFound: {
    title: string;
    message: string;
    backToFeed: string;
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
    invalidPreferredLanguage: string;
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
    back: string;
    retry: string;
    close: string;
  };
};