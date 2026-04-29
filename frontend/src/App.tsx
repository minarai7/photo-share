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
import { ProtectedRoute } from "./routes/ProtectedRoute"
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<FeedPage />} />
        <Route path="/signup" element={
          <PublicOnlyRoute>
            <SignupPage />
          </PublicOnlyRoute>
          }
        />
        <Route path="/login" element={
          <PublicOnlyRoute>
            <LoginPage />
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
        <Route path="/posts/:postId/edit" element={
          <ProtectedRoute>
            <EditPostPage />
          </ProtectedRoute>
          } 
        />
        <Route path="/users/:userId" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}