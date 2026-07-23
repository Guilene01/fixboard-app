import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { createPost, uploadAttachment } from '../api/posts';
import { listTags } from '../api/tags';
import TextField from '../components/TextField';
import Textarea from '../components/Textarea';
import FileUpload from '../components/FileUpload';
import Button from '../components/Button';
import ErrorBanner from '../components/ErrorBanner';
import { getTagIcon } from '../utils/tagIcons';

export default function NewPostPage() {
  const navigate = useNavigate();
  const [tags, setTags] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    tag_id: '',
    logs_text: '',
    what_tried: '',
  });
  const [logFile, setLogFile] = useState(null);
  const [architectureImage, setArchitectureImage] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listTags().then(setTags).catch(() => {});
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.title.trim() || !form.description.trim() || !form.tag_id) {
      setError('Title, description, and tag are required.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const post = await createPost({
        title: form.title,
        description: form.description,
        tag_id: Number(form.tag_id),
        logs_text: form.logs_text || undefined,
        what_tried: form.what_tried || undefined,
      });

      const uploadErrors = [];
      if (logFile) {
        try {
          await uploadAttachment(post.id, logFile, 'log');
        } catch (err) {
          uploadErrors.push(`Log file didn't upload: ${err.message}`);
        }
      }
      if (architectureImage) {
        try {
          await uploadAttachment(post.id, architectureImage, 'architecture');
        } catch (err) {
          uploadErrors.push(`Architecture image didn't upload: ${err.message}`);
        }
      }

      navigate(`/posts/${post.id}`, {
        state: uploadErrors.length ? { uploadErrors } : undefined,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <button
        onClick={() => navigate(-1)}
        className="flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft size={15} />
        Back
      </button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">New Post</h1>
        <p className="mt-1 text-sm text-text-muted">
          The more context you include, the easier it is for others to help — and for future
          students to find this later.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6"
      >
        <ErrorBanner message={error} />

        <TextField
          label="Title *"
          placeholder="e.g. CrashLoopBackOff after changing readiness probe"
          value={form.title}
          onChange={update('title')}
        />

        <Textarea
          label="Description *"
          hint="What's the problem? What's your environment?"
          rows={4}
          placeholder="Describe what's happening, your environment, and what you expected instead…"
          value={form.description}
          onChange={update('description')}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-muted">Tag *</span>
          <TagSelect tags={tags} value={form.tag_id} onChange={update('tag_id')} />
        </label>

        <Textarea
          label="Logs"
          hint="Optional — paste relevant log output"
          mono
          rows={5}
          placeholder="Paste log output here…"
          value={form.logs_text}
          onChange={update('logs_text')}
        />

        <FileUpload
          label="Log file"
          kind="file"
          file={logFile}
          onChange={setLogFile}
          accept=".log,.txt,text/plain"
        />

        <Textarea
          label="What's been tried"
          hint="Optional"
          rows={3}
          placeholder="What have you already attempted?"
          value={form.what_tried}
          onChange={update('what_tried')}
        />

        <FileUpload
          label="Architecture image"
          kind="image"
          file={architectureImage}
          onChange={setArchitectureImage}
          accept="image/*"
        />

        <div className="mt-1 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Posting…' : 'Post'}
            {!submitting && <Send size={15} />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function TagSelect({ tags, value, onChange }) {
  const Icon = getTagIcon(tags.find((t) => String(t.id) === value)?.name);

  return (
    <div className="relative">
      <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none rounded-lg border border-border bg-surface-raised py-2.5 pl-9 pr-3.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="" disabled>
          Select a tag…
        </option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
    </div>
  );
}
