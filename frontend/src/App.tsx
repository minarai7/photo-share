import { Route, Routes } from "react-router"
import { SignupPage } from "./pages/SignupPage"
import { LoginPage } from "./pages/LoginPage"
import { FeedPage } from "./pages/FeedPage"
import { CreatePostPage } from "./pages/CreatePostPage"
import { PostDetailPage } from "./pages/PostDetailPage"
import { EditPostPage } from "./pages/EditPostPage"
import { ProfilePage } from "./pages/ProfilePage"
import { NotFoundPage } from "./pages/NotFoundPage"
import { Layout } from "./components/Layout"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<FeedPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/posts/new" element={<CreatePostPage />} />
        <Route path="/posts/:postId" element={<PostDetailPage />} />
        <Route path="/posts/:postId/edit" element={<EditPostPage />} />
        <Route path="/users/:userId" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}