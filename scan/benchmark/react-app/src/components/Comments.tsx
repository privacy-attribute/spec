import { useComments } from '../hooks/data';

export function Comments({ threadId }: { threadId: string }) {
  const comments = useComments(threadId);
  return (
    <ul className="comments">
      {comments.map((comment) => (
        <li key={comment.id} className="comment"> {/* @expect third-party mask */}
          <strong>{comment.author.displayName}</strong> {/* @expect third-party mask */}
          <div className="comment-body" dangerouslySetInnerHTML={{ __html: comment.html }} /> {/* @expect third-party mask */}
          <time>{comment.createdAt}</time>
        </li>
      ))}
    </ul>
  );
}
