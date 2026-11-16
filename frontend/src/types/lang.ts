export type LanguageCode = "en" | "ja";

// Copy is written in sentence case; uppercase comes from CSS (DESIGN-SYSTEM.md
// §3.2, §10). Functions take strings and numbers only.
export type TranslationDictionary = {
  app: {
    title: string;
  };

  /** The fixed header and the one Close. */
  header: {
    newPost: string;
    newPostLabel: string;
    login: string;
    close: string;
    closeToFeed: string;
    closeToProfile: string;
    closeToPost: string;
    /** The Index link: "All 10 works". */
    allWorks: (total: number) => string;
    /** The Index link while a filter narrows the set: "4 of 10 works". */
    someWorks: (count: number, total: number) => string;
    /** Its spoken label: "4 of 10 works: index, sort and filter". */
    indexLabel: (visible: string) => string;
  };

  /** The landing hero and the person hero. */
  hero: {
    tagline: string;
    scroll: string;
    newPost: string;
    /** The landing hero's link to the member's own works (their profile reel). */
    yourWorks: string;
    allWorks: string;
    /** The person hero of a member with no works yet: theirs, and someone else's. */
    firstWork: string;
    noWorksBy: (username: string) => string;
    login: string;
    signup: string;
    logout: string;
    /** "12 works · 31 photographs". */
    stats: (works: number, photos: number) => string;
  };

  /** The feed / profile reel. */
  reel: {
    loading: string;
    loadFailed: string;
    retry: string;
    endHere: string;
    endBy: (username: string) => string;
    allWorks: string;
    backToTop: string;
    noWorksYet: string;
    noMatch: string;
    clearFilters: string;
    openWork: (caption: string) => string;
    photos: (caption: string, count: number) => string;
    untitled: string;
  };

  /** The Index: contact sheet + sort and filter. */
  index: {
    title: string;
    works: (count: number) => string;
    someWorks: (count: number, total: number) => string;
    rules: string;
    worksLabel: string;
    sort: string;
    by: string;
    only: string;
    newest: string;
    oldest: string;
    most: string;
    single: string;
    series: string;
    clearAll: string;
    nothing: string;
    photoCount: (count: number) => string;
    loadingPeople: string;
  };

  /** The line under the wordmark naming the active filters. */
  filterLine: {
    byOne: (name: string) => string;
    byTwo: (first: string, second: string) => string;
    /** "by a, b and" — followed by the "3 others" trigger. */
    byManyStart: (first: string, second: string) => string;
    others: (count: number) => string;
    othersLabel: (count: number, names: string) => string;
    by: string;
    seriesOnly: string;
    singleOnly: string;
    clear: string;
  };

  /** The post view, its wall label and lights out. */
  post: {
    loading: string;
    loadFailed: string;
    info: string;
    infoDown: string;
    infoUp: string;
    previousPhoto: string;
    nextPhoto: string;
    photoOf: (caption: string, position: number, total: number) => string;
    photoPosition: (position: number, total: number) => string;
    viewFull: (alt: string) => string;
    lightsOut: (caption: string) => string;
    about: string;
    manage: string;
    edit: string;
    delete: string;
  };

  editPost: {
    title: string;
    caption: string;
    place: string;
    camera: string;
    lens: string;
    cancel: string;
    save: string;
    saving: string;
    failed: string;
  };

  deletePost: {
    title: string;
    description: (caption: string, photos: number) => string;
    cancel: string;
    confirm: string;
    deleting: string;
    failed: string;
  };

  gear: {
    find: string;
    findLabel: (name: string) => string;
    finding: string;
    kicker: string;
    noReliableLinks: string;
    confidenceHigh: string;
    confidenceMedium: string;
    confidenceLow: string;
    findFailed: string;
    note: string;
    close: string;
  };

  auth: {
    loginTitle: string;
    signupTitle: string;
    loginSubtitle: string;
    signupSubtitle: string;
    email: string;
    username: string;
    password: string;
    passwordHint: string;
    loginButton: string;
    signupButton: string;
    pending: string;
    noAccount: string;
    haveAccount: string;
    signupLink: string;
    loginLink: string;
    loginFailed: string;
    signupFailed: string;
  };

  compose: {
    title: string;
    preview: string;
    untitled: string;
    choosePhotos: string;
    limits: (maxPhotos: number, maxMb: number) => string;
    reorderHint: string;
    gearHint: string;
    caption: string;
    place: string;
    camera: string;
    lens: string;
    optional: string;
    fromPhoto: string;
    publish: string;
    publishing: string;
    uploading: string;
    addPhotos: string;
    cover: string;
    coverAlt: (name: string) => string;
    photoLabel: (position: number, total: number, name: string) => string;
    removePhoto: (position: number) => string;
    failed: string;
  };

  toast: {
    published: string;
    updated: string;
    deleted: string;
    signedOut: string;
    welcomeBack: string;
    welcome: string;
    signedInAs: (username: string) => string;
    signedUpAs: (username: string) => string;
  };

  settings: {
    language: string;
    english: string;
    japanese: string;
    languageSaveFailed: string;
  };

  validation: {
    usernameRequired: string;
    emailInvalid: string;
    passwordRequired: string;
    passwordTooShort: string;
    photoRequired: string;
    photoTooLarge: (sizeMb: number) => string;
    photoWrongType: string;
    tooManyPhotos: (max: number) => string;
  };

  notFound: {
    message: string;
    userMessage: string;
    backToFeed: string;
  };

  apiErrors: {
    invalidJson: string;
    invalidKind: string;
    invalidLanguage: string;
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
    invalidPagination: string;
    invalidSort: string;
    invalidPhotosFilter: string;
    unauthorized: string;
    createPostFailed: string;
    invalidThumbnailPath: string;
    tooManyImages: string;
    duplicateImage: string;
    forbidden: string;
    invalidMultipartForm: string;
    imageRequired: string;
    fileTooLarge: string;
    invalidFileType: string;
    invalidImage: string;
    uploadFailed: string;
    unknown: string;
  };
};
