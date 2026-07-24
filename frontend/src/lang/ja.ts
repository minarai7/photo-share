import type { TranslationDictionary } from "../types/lang";

export const ja: TranslationDictionary = {
  app: {
    title: "Photo Share",
  },

  nav: {
    feed: "フィード",
    createPost: "投稿を作成",
    profile: (username: string) => `${username}さんのプロフィール`,
    login: "ログイン",
    logout: "ログアウト",
    signup: "新規登録",
  },

  auth: {
    email: "メールアドレス",
    username: "ユーザー名",
    password: "パスワード",

    loginTitle: "ログイン",
    signupTitle: "新規登録",

    loginButton: "ログイン",
    signupButton: "登録",

    loginFailed: "ログインに失敗しました。メールアドレスとパスワードを確認してください。",
    signupFailed: "新規登録に失敗しました。もう一度お試しください。",

    loggingIn: "ログイン中...",
    creatingAccount: "アカウントを作成中...",

    signupSuccess: "アカウントを作成しました。",

    alreadyHaveAccountLogin: "すでにアカウントをお持ちですか？ログイン",
    dontHaveAccountSignup: "アカウントをお持ちでないですか？新規登録",

    emailPlaceholder: "example@email.com",
    usernamePlaceholder: "例：yamada_taro",
    passwordPlaceholder: "8文字以上",
  },

  posts: {
    feedTitle: "写真フィード",
    feedSubtitle: "ユーザーが共有した最新の写真を見てみましょう",
    loadingPosts: "投稿を読み込み中...",
    loadPostsFailed: "投稿を読み込めませんでした。",
    noPosts: "まだ投稿がありません。",
    backToFeed: "フィードに戻る",
    backToProfile: "プロフィールに戻る",

    createPostTitle: "投稿を作成",
    editPostTitle: "投稿を編集",
    postDetailTitle: "投稿詳細",

    title: "タイトル",
    caption: "キャプション",
    location: "場所",
    camera: "カメラ",
    lens: "レンズ",
    created: "作成日時",

    photo: "写真",
    selectedPreviewAlt: "選択した画像のプレビュー",
    choosePhoto: "写真を選択",
    supportedImageTypes: "JPG、PNG、WebP形式",
    creatingPost: "作成中...",
    createPostButton: "投稿を作成",
    createPostFailed: "投稿を作成できませんでした。もう一度お試しください。",

    submit: "送信",
    save: "保存",
    saving: "保存中...",
    delete: "削除",
    deleting: "削除中...",
    edit: "編集",

    loadingPost: "投稿を読み込み中...",
    loadPostFailed: "投稿を読み込めませんでした。",
    updatePostFailed: "投稿を更新できませんでした。",
    deletePostFailed: "投稿を削除できませんでした。",
    postNotFound: "投稿が見つかりません。",
    postIdMissing: "投稿IDが見つかりません。",
    invalidPostId: "投稿IDが正しくありません。",
    deleteConfirm: "この投稿を削除しますか？この操作は取り消せません。",
    notSpecified: "未設定",
    postImageAlt: "投稿画像",
  },

  profile: {
  title: "プロフィール",
  userPostsTitle: (username: string) => `${username}さんの投稿`,
  postCount: (count: number) => `${count}件の投稿`,
  ownEmptyPostsMessage: "まだ投稿を作成していません。",
  createFirstPost: "最初の投稿を作成",
  loadProfileFailed: "プロフィールの投稿を読み込めませんでした。",
  },

  aiGear: {
  finding: "検索中...",
  findProduct: "製品を探す",
  modalKicker: "AI機材検索",
  productSuggestions: "製品候補",
  findFailed: "製品リンクを見つけられませんでした。もう一度お試しください。",
  noReliableLinks: "信頼できる製品リンクは見つかりませんでした。",
  confidence: "信頼度",
  confidenceHigh: "高",
  confidenceMedium: "中",
  confidenceLow: "低",
  confidenceUnknown: "不明",
  warning:
    "AIの候補は不正確な場合があります。購入前に製品ページを確認してください。",
},

  settings: {
    language: "言語",
    english: "英語",
    japanese: "日本語",
    savingLanguage: "言語設定を保存中...",
    languageSaveFailed: "言語設定を保存できませんでした。もう一度お試しください。",
  },

  validation: {
    usernameRequired: "ユーザー名を入力してください。",
    emailRequired: "メールアドレスを入力してください。",
    passwordRequired: "パスワードを入力してください。",
    passwordTooShort: "パスワードは8文字以上で入力してください。",
    photoRequired: "写真を選択してください。",
    userIdMissing: "ユーザーIDが見つかりません。",
    invalidUserId: "ユーザーIDが正しくありません。",
  },

  notFound: {
    title: "404 Not Found",
    message: "お探しのページは存在しません。",
    backToFeed: "フィードに戻る",
  },

  apiErrors: {
    invalidJson: "リクエストデータが正しくありません。",
    invalidKind: "カメラまたはレンズを選択してください。",
    emptyName: "名前を入力してください。",
    aiConfigMissing: "AI検索はまだ設定されていません。",
    aiRequestFailed: "AIによる機材候補の取得に失敗しました。もう一度お試しください。",
    invalidUserId: "ユーザーIDが正しくありません。",
    userNotFound: "ユーザーが見つかりません。",
    internalError: "エラーが発生しました。もう一度お試しください。",
    signupFailed: "新規登録に失敗しました。入力内容を確認してもう一度お試しください。",
    invalidCredentials: "メールアドレスまたはパスワードが正しくありません。",
    invalidPostId: "投稿IDが正しくありません。",
    invalidPreferredLanguage: "英語または日本語を選択してください。",
    postNotFound: "投稿が見つかりません。",
    listPostsFailed: "投稿を読み込めませんでした。もう一度お試しください。",
    unauthorized: "もう一度ログインしてください。",
    createPostFailed: "投稿を作成できませんでした。入力内容を確認してもう一度お試しください。",
    forbidden: "この操作を行う権限がありません。",
    invalidMultipartForm: "アップロードフォームが正しくないか、ファイルサイズが大きすぎます。",
    imageRequired: "画像ファイルを選択してください。",
    fileTooLarge: "画像ファイルのサイズが大きすぎます。",
    invalidFileType: "JPEG、PNG、WebP形式の画像のみアップロードできます。",
    uploadFailed: "画像のアップロードに失敗しました。もう一度お試しください。",
    unknown: "エラーが発生しました。もう一度お試しください。",
  },

  common: {
    loading: "読み込み中...",
    error: "エラーが発生しました。",
    cancel: "キャンセル",
    confirm: "確認",
    back: "戻る",
    retry: "再試行",
    close: "閉じる",
  },
};