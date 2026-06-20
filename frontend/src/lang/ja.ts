import type { TranslationDictionary } from "./types";

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
    loginFailed: "ログインできませんでした。もう一度お試しください。",
  },

  posts: {
    feedTitle: "フィード",
    createPostTitle: "投稿を作成",
    editPostTitle: "投稿を編集",
    caption: "キャプション",
    location: "場所",
    cameraBody: "カメラ本体",
    lens: "レンズ",
    submit: "送信",
    save: "保存",
    delete: "削除",
  },

  profile: {
    title: "プロフィール",
    myPosts: "自分の投稿",
    noPosts: "まだ投稿がありません。",
  },

  settings: {
    language: "言語",
    english: "英語",
    japanese: "日本語",
  },

  validation: {
    emailRequired: "Email is required.",
    passwordRequired: "Password is required.",
    invalidEmail: "有効なメールアドレスを入力してください。",
    passwordTooShort: "パスワードは8文字以上で入力してください。",
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
  },
};