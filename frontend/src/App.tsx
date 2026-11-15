import { Route, Routes } from "react-router"
import { AuthPage } from "./pages/AuthPage"
import { FeedPage, ProfilePage } from "./pages/FeedPage"
import { CreatePostPage } from "./pages/CreatePostPage"
import { PostDetailPage } from "./pages/PostDetailPage"
import { NotFoundPage } from "./pages/NotFoundPage"
import { Layout } from "./components/Layout"
import { ProtectedRoute } from "./routes/ProtectedRoute"
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<FeedPage />} />
        <Route path="/signup" element={
          <PublicOnlyRoute>
            <AuthPage mode="signup" key="signup" />
          </PublicOnlyRoute>
          }
        />
        <Route path="/login" element={
          <PublicOnlyRoute>
            <AuthPage mode="login" key="login" />
          </PublicOnlyRoute>
          }
        />
        <Route path="/posts/new" element={
          <ProtectedRoute>
            <CreatePostPage />
          </ProtectedRoute>
          }
        />
        <Route path="/posts/:postId" element={<PostDetailPage />} />
        <Route path="/users/:userId" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
