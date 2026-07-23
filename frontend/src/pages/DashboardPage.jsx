import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Plus } from 'lucide-react';
import { listPosts } from '../api/posts';
import { listTags } from '../api/tags';
import TagFilter from '../components/TagFilter';
import PostRow from '../components/PostRow';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [tags, setTags] = useState([]);
  const [activeTag, setActiveTag] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listTags().then(setTags).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    listPosts({ tag: activeTag })
      .then(setPosts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeTag]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">
          Browse troubleshooting threads from your cohort.
        </p>
      </div>

      <TagFilter tags={tags} active={activeTag} onChange={setActiveTag} />

      {loading && <Spinner label="Loading posts…" full />}

      {!loading && error && (
        <EmptyState
          icon={Inbox}
          title="Couldn't load posts"
          description={error}
        />
      )}

      {!loading && !error && posts.length === 0 && (
        <EmptyState
          icon={Inbox}
          title={activeTag ? `No posts tagged "${activeTag}" yet` : 'No posts yet'}
          description="Be the first to post a problem and start building the knowledge base."
          action={
            <Button onClick={() => navigate('/posts/new')}>
              <Plus size={16} />
              New Post
            </Button>
          }
        />
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {posts.map((post) => (
            <PostRow
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
