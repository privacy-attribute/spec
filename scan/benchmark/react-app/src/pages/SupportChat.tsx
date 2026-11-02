import { useThread } from '../hooks/data';

export function SupportChat({ ticketId }: { ticketId: string }) {
  const thread = useThread(ticketId);
  return (
    <div className="chat">
      <header>Conversation with {thread.requester}</header> {/* @expect third-party mask */}
      <ol className="messages">
        {thread.items.map((msg) => (
          <li key={msg.id} className={msg.fromAgent ? 'agent' : 'customer'}>
            <span className="who">{msg.from}</span> {/* @expect third-party mask */}
            <p className="text">{msg.body}</p> {/* @expect third-party mask */}
            {msg.attachment && <img src={msg.attachment.previewUrl} alt={msg.attachment.filename} />} {/* @expect third-party mask */}
          </li>
        ))}
      </ol>
      <textarea className="composer" placeholder="Write a reply" /> {/* @expect personal mask */}
    </div>
  );
}
