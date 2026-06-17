import type { TranslationDictionary } from "./types";

export const ja: TranslationDictionary = {
  app: {
    title: "Photo Share",
  },

  nav: {
    feed: "フィード",
    createPost: "投稿を作成",
    profile: "プロフィール",
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
  },

  posts: {
    feedTitle: "写真フィード",
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
    required: "この項目は必須です。",
    invalidEmail: "有効なメールアドレスを入力してください。",
    passwordTooShort: "パスワードは8文字以上で入力してください。",
  },

  common: {
    loading: "読み込み中...",
    error: "エラーが発生しました。",
    cancel: "キャンセル",
    confirm: "確認",
  },
};