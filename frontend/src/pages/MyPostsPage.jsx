import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, Plus } from 'lucide-react';
import { getMyPosts } from '../api/posts';
import { markNotificationsRead } from '../api/notifications';
import PostCard from '../components/PostCard';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import { useNotifications } from '../context/NotificationsContext';

export default function MyPostsPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { refreshUnreadCount } = useNotifications();

  useEffect(() => {
    getMyPosts()
      .then(setPosts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    markNotificationsRead()
      .then(refreshUnreadCount)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">My Posts</h1>
          <p className="mt-1 text-sm text-text-muted">
            Everything you've posted, in one place.
          </p>
        </div>
        <Button onClick={() => navigate('/posts/new')}>
          <Plus size={16} />
          New Post
        </Button>
      </div>

      {loading && <Spinner label="Loading your posts…" full />}

      {!loading && error && (
        <EmptyState icon={FileQuestion} title="Couldn't load your posts" description={error} />
      )}

      {!loading && !error && posts.length === 0 && (
        <EmptyState
          icon={FileQuestion}
          title="You haven't posted yet"
          description="Stuck on something? Post the full context and get help from your cohort."
          action={
            <Button onClick={() => navigate('/posts/new')}>
              <Plus size={16} />
              New Post
            </Button>
          }
        />
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
